/**
 * Test-only fixture: an in-process Postgres (PGlite) holding the Equity tables (real migrations
 * 018 + 020), a minimal copy of the portal tables, and simple SQL stand-ins for the two Lovable
 * functions our role may call:
 *
 *   pl2_system_mark_lines_sent(_batch uuid, _lines uuid[], _file_ref text) returns integer
 *   pl2_system_record_result(_line uuid, _status text, _reason text, _txn text) returns text
 *
 * The stand-ins also write every call to `pl2_calls`, and raise when the batch / line id is in
 * `pl2_poison`, so tests can check the arguments and simulate a failing function.
 *
 * Not imported by production code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { v4 as uuidv4 } from 'uuid';
import { splitSqlStatements } from './equityBatchSchema';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

const FIXTURE_SCHEMA = `
CREATE TYPE bank_transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TABLE users (user_id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE farmers (
  farmer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone_number TEXT,
  country TEXT
);
CREATE TABLE payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), status TEXT);
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  farmer_id UUID REFERENCES farmers(farmer_id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  recipient_phone TEXT NOT NULL,
  status bank_transaction_status NOT NULL DEFAULT 'pending',
  initiated_by UUID REFERENCES users(user_id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref TEXT,
  status TEXT,
  country TEXT,
  currency TEXT,
  released_by UUID,
  released_at TIMESTAMPTZ,
  send_error TEXT
);
CREATE TABLE payment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES payment_batches(id),
  farmer_id UUID,
  farmer_name TEXT,
  amount NUMERIC,
  currency TEXT,
  country TEXT,
  stage TEXT,
  hold_kind TEXT,
  file_ref TEXT,
  fail_reason TEXT,
  bank_txn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  user_role TEXT,
  action TEXT NOT NULL,
  category TEXT,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  success BOOLEAN,
  created_at TIMESTAMPTZ
);

-- Stand-in bookkeeping
CREATE TABLE pl2_calls (
  n SERIAL PRIMARY KEY,
  fn TEXT NOT NULL,
  args JSONB NOT NULL,
  result TEXT
);
CREATE TABLE pl2_poison (id UUID PRIMARY KEY);

CREATE FUNCTION pl2_system_mark_lines_sent(_batch uuid, _lines uuid[], _file_ref text)
RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pl2_poison WHERE id = _batch) THEN
    RAISE EXCEPTION 'pl2_system_mark_lines_sent: simulated failure';
  END IF;
  UPDATE payment_lines
     SET stage = 'sent', file_ref = _file_ref
   WHERE id = ANY(_lines) AND batch_id = _batch AND stage = 'payment_approved';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE payment_batches SET status = 'sent' WHERE id = _batch AND status = 'approved';
  INSERT INTO pl2_calls (fn, args, result)
    VALUES ('mark_lines_sent', jsonb_build_object('batch', _batch, 'lines', to_jsonb(_lines), 'file_ref', _file_ref), n::text);
  RETURN n;
END $fn$;

CREATE FUNCTION pl2_system_record_result(_line uuid, _status text, _reason text, _txn text)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE out text;
BEGIN
  IF EXISTS (SELECT 1 FROM pl2_poison WHERE id = _line) THEN
    RAISE EXCEPTION 'pl2_system_record_result: simulated failure';
  END IF;
  IF _status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'bad status';
  END IF;
  IF _status = 'failed' AND (_reason IS NULL OR btrim(_reason) = '') THEN
    RAISE EXCEPTION 'failed needs a reason';
  END IF;
  out := NULL;
  UPDATE payment_lines
     SET stage = CASE WHEN _status = 'paid' THEN 'paid' ELSE 'failed' END,
         fail_reason = _reason,
         bank_txn = _txn
   WHERE id = _line AND stage = 'sent'
  RETURNING _status INTO out;
  INSERT INTO pl2_calls (fn, args, result)
    VALUES ('record_result', jsonb_build_object('line', _line, 'status', _status, 'reason', _reason, 'txn', _txn), out);
  RETURN out;
END $fn$;
`;

export async function createPortalTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE_SCHEMA);
  for (const file of ['018_equity_sftp_batches.sql', '020_equity_portal_batches.sql']) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of splitSqlStatements(sql)) await db.query(statement);
  }
  return db;
}

export async function resetPortalTestDb(db: PGlite): Promise<void> {
  await db.exec(
    `TRUNCATE pl2_calls, pl2_poison, audit_logs, bank_transactions, equity_response_files,
              equity_payment_batches, payment_lines, payment_batches, payments, farmers, users CASCADE`
  );
}

export type SeededPortalFile = {
  /** equity_payment_batches.id */
  equityBatchId: string;
  /** payment_batches.id (the portal batch) */
  portalBatchId: string;
  /** Plaintext outbound name, as stored in equity_payment_batches.filename. */
  filename: string;
  /** Name of the encrypted file that is uploaded (filename + '.pgp'). */
  uploadName: string;
  customerReferences: string[];
  lineIds: string[];
  txIds: string[];
};

let seq = 0;

/**
 * One portal batch with `lines` released payment lines and ONE generated Equity file holding all
 * of them, as buildUgandaPortalBatches leaves things: file 'generated', transactions 'pending'.
 */
export async function seedPortalFile(
  db: PGlite,
  lines: number,
  opts: { filename?: string; txStatus?: string } = {}
): Promise<SeededPortalFile> {
  const n = ++seq;
  const portalBatchId = uuidv4();
  await db.query(
    `INSERT INTO payment_batches (id, batch_ref, status, country, currency, released_at, send_error)
     VALUES ($1, $2, 'approved', 'Uganda', 'UGX', now(), NULL)`,
    [portalBatchId, `PB-${n}`]
  );

  const equityBatchId = uuidv4();
  const filename = opts.filename ?? `TMP224_56010646936_MD_17092026_DRAPIUSUG_ALL2026091712${String(n).padStart(4, '0')}.csv`;
  await db.query(
    `INSERT INTO equity_payment_batches
       (id, customer_id, template_id, entity_code, filename, sequence_no, value_date,
        debit_account_no, status, row_count, portal_batch_id)
     VALUES ($1, '56010646936', 'TMP224', 'DRAPIUSUG', $2, $3, '2026-09-17', '1003200930075',
             'generated', $4, $5)`,
    [equityBatchId, filename, n, lines, portalBatchId]
  );

  const lineIds: string[] = [];
  const txIds: string[] = [];
  const customerReferences: string[] = [];
  for (let i = 0; i < lines; i++) {
    const lineId = uuidv4();
    await db.query(
      `INSERT INTO payment_lines (id, batch_id, amount, currency, country, stage)
       VALUES ($1, $2, 10000, 'UGX', 'Uganda', 'payment_approved')`,
      [lineId, portalBatchId]
    );
    const txId = uuidv4();
    const ref = `DU20260917120000${String(n * 100 + i).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO bank_transactions
         (id, payment_line_id, amount, currency, recipient_phone, status, batch_id, customer_reference, channel)
       VALUES ($1, $2, 10000, 'UGX', '0751000000', $3, $4, $5, 'sftp_file')`,
      [txId, lineId, opts.txStatus ?? 'pending', equityBatchId, ref]
    );
    lineIds.push(lineId);
    txIds.push(txId);
    customerReferences.push(ref);
  }
  return { equityBatchId, portalBatchId, filename, uploadName: `${filename}.pgp`, customerReferences, lineIds, txIds };
}

/** Same shape, but built from the payments table (no payment_line_id, no portal_batch_id). */
export async function seedPaymentsFile(
  db: PGlite,
  rows: number,
  opts: { filename?: string; txStatus?: string } = {}
): Promise<{ equityBatchId: string; filename: string; uploadName: string; paymentIds: string[]; customerReferences: string[]; txIds: string[] }> {
  const n = ++seq;
  const equityBatchId = uuidv4();
  const filename = opts.filename ?? `TMP224_56010646936_MD_17092026_DRAPIUSUG_ALL2026091713${String(n).padStart(4, '0')}.csv`;
  await db.query(
    `INSERT INTO equity_payment_batches
       (id, customer_id, template_id, entity_code, filename, sequence_no, value_date,
        debit_account_no, status, row_count)
     VALUES ($1, '56010646936', 'TMP224', 'DRAPIUSUG', $2, $3, '2026-09-17', '1003200930075',
             'generated', $4)`,
    [equityBatchId, filename, n, rows]
  );
  const paymentIds: string[] = [];
  const txIds: string[] = [];
  const customerReferences: string[] = [];
  for (let i = 0; i < rows; i++) {
    const paymentId = uuidv4();
    await db.query(`INSERT INTO payments (id, status) VALUES ($1, 'pending')`, [paymentId]);
    const txId = uuidv4();
    const ref = `DU20260917130000${String(n * 100 + i).padStart(4, '0')}`;
    await db.query(
      `INSERT INTO bank_transactions
         (id, payment_id, amount, currency, recipient_phone, status, batch_id, customer_reference, channel)
       VALUES ($1, $2, 10000, 'UGX', '0751000000', $3, $4, $5, 'sftp_file')`,
      [txId, paymentId, opts.txStatus ?? 'pending', equityBatchId, ref]
    );
    paymentIds.push(paymentId);
    txIds.push(txId);
    customerReferences.push(ref);
  }
  return { equityBatchId, filename, uploadName: `${filename}.pgp`, paymentIds, customerReferences, txIds };
}
