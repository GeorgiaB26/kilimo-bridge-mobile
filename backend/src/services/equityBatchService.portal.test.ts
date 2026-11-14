/**
 * Tests for the portal source of the Equity Uganda batch builder (buildUgandaPortalBatches).
 *
 * These run the REAL candidate SQL and the real 018 + 020 migrations against an in-process
 * Postgres (PGlite), with pg's Pool pointed at it. The fixture tables for the parts of the
 * schema that live outside our migrations (users, farmers, payments, bank_transactions base
 * table, the portal's payment_lines / payment_batches) mirror the production column names.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import * as openpgp from 'openpgp';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { splitSqlStatements } from './equityBatchSchema';
import {
  buildUgandaPortalBatches,
  parsePortalAmount,
  splitPlanByPortalBatch,
  UGANDA_PORTAL_CANDIDATES_SQL,
  type PlannedUgandaPayment,
} from './equityBatchService';

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
CREATE TABLE payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  farmer_id UUID REFERENCES farmers(farmer_id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  recipient_phone TEXT NOT NULL,
  status bank_transaction_status NOT NULL DEFAULT 'pending',
  initiated_by UUID REFERENCES users(user_id),
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
`;

let db: PGlite;
let executed: string[] = [];
let tmpDir: string;
const originalConnect = Pool.prototype.connect;
const originalQuery = Pool.prototype.query;
const savedEnv = { ...process.env };

async function applyMigrationFile(file: string): Promise<void> {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  for (const statement of splitSqlStatements(sql)) {
    await db.query(statement);
  }
}

before(async () => {
  db = new PGlite();
  await db.exec(FIXTURE_SCHEMA);
  await applyMigrationFile('018_equity_sftp_batches.sql');
  await applyMigrationFile('020_equity_portal_batches.sql');

  const record = (text: string) => {
    executed.push(text);
  };
  (Pool.prototype as unknown as { connect: unknown }).connect = async function () {
    return {
      query: async (text: string, params?: unknown[]) => {
        record(text);
        return db.query(text, params);
      },
      release: () => undefined,
    };
  };
  (Pool.prototype as unknown as { query: unknown }).query = async function (
    text: string,
    params?: unknown[]
  ) {
    record(text);
    return db.query(text, params);
  };

  // A real (throw-away) public key so non-dry runs can encrypt.
  const { publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519Legacy',
    userIDs: [{ name: 'Equity Test', email: 'equity@example.test' }],
    format: 'armored',
  });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'equity-portal-test-'));
  const keyPath = path.join(tmpDir, 'equity-public.asc');
  fs.writeFileSync(keyPath, publicKey);

  process.env.DATABASE_URL = 'postgres://stub:stub@127.0.0.1:1/stub';
  process.env.EQUITY_SFTP_CUSTOMER_ID = '56010646936';
  process.env.EQUITY_UG_DEBIT_ACCOUNT = '1003200930075';
  process.env.EQUITY_BANK_PUBLIC_KEY_PATH = keyPath;
});

after(async () => {
  (Pool.prototype as unknown as { connect: unknown }).connect = originalConnect;
  (Pool.prototype as unknown as { query: unknown }).query = originalQuery;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    `TRUNCATE audit_logs, bank_transactions, equity_response_files, equity_payment_batches,
              payment_lines, payment_batches, payments, farmers, users CASCADE`
  );
  executed = [];
  process.env.EQUITY_AUTO_SEND_MAX_TOTAL = '1000000000000';
  delete process.env.EQUITY_AUTO_SEND_MAX_PAYMENTS;
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let seq = 0;

type BatchOpts = {
  status?: string;
  country?: string;
  currency?: string;
  released?: boolean;
};

async function seedBatch(opts: BatchOpts = {}): Promise<string> {
  const id = uuidv4();
  await db.query(
    `INSERT INTO payment_batches (id, batch_ref, status, country, currency, released_by, released_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      `PB-${++seq}`,
      opts.status ?? 'approved',
      opts.country ?? 'Uganda',
      opts.currency ?? 'UGX',
      opts.released === false ? null : uuidv4(),
      opts.released === false ? null : new Date('2026-11-10T08:00:00Z'),
    ]
  );
  return id;
}

type LineOpts = {
  amount?: string | number | null;
  currency?: string;
  stage?: string;
  holdKind?: string | null;
  name?: string;
  phone?: string;
};

type SeededLine = { id: string; name: string; phone: string };

async function seedLine(batchId: string, opts: LineOpts = {}): Promise<SeededLine> {
  const n = ++seq;
  const name = opts.name ?? `Zuberi${n} Mwesigwa${n}`;
  const phone = opts.phone ?? `0751${String(n).padStart(6, '0')}`;
  const farmerId = uuidv4();
  await db.query(`INSERT INTO farmers (farmer_id, name, phone_number, country) VALUES ($1, $2, $3, 'Uganda')`, [
    farmerId,
    name,
    phone,
  ]);
  const id = uuidv4();
  await db.query(
    `INSERT INTO payment_lines (id, batch_id, farmer_id, farmer_name, amount, currency, country, stage, hold_kind)
     VALUES ($1, $2, $3, $4, $5, $6, 'Uganda', $7, $8)`,
    [
      id,
      batchId,
      farmerId,
      name,
      opts.amount === undefined ? '10000.00' : opts.amount,
      opts.currency ?? 'UGX',
      opts.stage ?? 'payment_approved',
      opts.holdKind ?? null,
    ]
  );
  return { id, name, phone };
}

async function seedBankTx(
  lineId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  extra: { channel?: string; errorCode?: string | null } = {}
): Promise<void> {
  await db.query(
    `INSERT INTO bank_transactions (payment_line_id, amount, currency, recipient_phone, status, channel, equity_error_code)
     VALUES ($1, 10000, 'UGX', '0751000000', $2, $3, $4)`,
    [lineId, status, extra.channel ?? 'sftp_file', extra.errorCode ?? null]
  );
}

async function count(table: string): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return res.rows[0].n;
}

async function snapshot(table: string): Promise<string> {
  const res = await db.query(`SELECT * FROM ${table} ORDER BY id`);
  return JSON.stringify(res.rows);
}

function ok<T extends { status: string }>(r: T): Extract<T, { status: 'ok' }> {
  assert.equal(r.status, 'ok');
  return r as Extract<T, { status: 'ok' }>;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test('portal: only lines of released, approved/sent Uganda UGX batches are picked', async () => {
  const released = await seedBatch();
  const ok1 = await seedLine(released, { amount: '1000.00' });
  const ok2 = await seedLine(released, { amount: 2000 });
  const retry = await seedLine(released); // our own upload failed earlier: selectable again
  await seedBankTx(retry.id, 'failed', { errorCode: 'UPLOAD_FAILED' });

  // Excluded lines inside the released batch
  await seedLine(released, { holdKind: 'compliance' }); // held
  await seedLine(released, { stage: 'centre_approved' }); // wrong stage
  await seedLine(released, { stage: 'paid' }); // wrong stage
  const livePending = await seedLine(released);
  await seedBankTx(livePending.id, 'pending');
  const liveProcessing = await seedLine(released);
  await seedBankTx(liveProcessing.id, 'processing', { channel: 'h2h_api' }); // any channel blocks
  const liveCompleted = await seedLine(released);
  await seedBankTx(liveCompleted.id, 'completed');
  const bankRejected = await seedLine(released);
  await seedBankTx(bankRejected.id, 'failed', { errorCode: 'R01' });
  const nonUgx = await seedLine(released, { currency: 'KES' }); // candidate, skipped with a reason

  // Excluded batches
  const notReleased = await seedBatch({ released: false });
  await seedLine(notReleased);
  const draft = await seedBatch({ status: 'draft' });
  await seedLine(draft);
  const kenya = await seedBatch({ country: 'Kenya', currency: 'KES' });
  await seedLine(kenya, { currency: 'KES' });
  const wrongCurrency = await seedBatch({ currency: 'KES' });
  await seedLine(wrongCurrency);

  // Included batches with other spellings / statuses
  const sent = await seedBatch({ status: 'sent' });
  const ok3 = await seedLine(sent);
  const spaced = await seedBatch({ country: '  UGANDA ' });
  const ok4 = await seedLine(spaced);

  const before = {
    lines: await snapshot('payment_lines'),
    batches: await snapshot('payment_batches'),
  };
  const result = ok(await buildUgandaPortalBatches({ dryRun: false, initiatedBy: null }));

  const picked = await db.query<{ payment_line_id: string; payment_id: string | null }>(
    `SELECT payment_line_id, payment_id FROM bank_transactions
      WHERE status = 'pending' AND payment_line_id IS NOT NULL AND batch_id IS NOT NULL`
  );
  assert.deepEqual(
    picked.rows.map((r) => r.payment_line_id).sort(),
    [ok1.id, ok2.id, retry.id, ok3.id, ok4.id].sort()
  );
  assert.ok(picked.rows.every((r) => r.payment_id === null));
  assert.ok(!picked.rows.some((r) => r.payment_line_id === nonUgx.id));

  assert.equal(result.candidateCount, 6); // 5 buildable + the non-UGX line
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedByReason, { INVALID_CURRENCY: 1 });
  assert.equal(result.deferredCount, 0);
  assert.equal(result.totalAmount, 1000 + 2000 + 10000 + 10000 + 10000);
  // One file per portal batch: released, sent, spaced-country.
  assert.equal(result.batches.length, 3);

  const rows = await db.query<{ portal_batch_id: string; status: string; row_count: number }>(
    `SELECT portal_batch_id, status, row_count FROM equity_payment_batches ORDER BY filename`
  );
  assert.deepEqual(rows.rows.map((r) => r.portal_batch_id).sort(), [released, sent, spaced].sort());
  assert.ok(rows.rows.every((r) => r.status === 'generated'));

  const txShape = await db.query<{ currency: string; channel: string; farmer_id: string | null }>(
    `SELECT currency, channel, farmer_id FROM bank_transactions WHERE payment_line_id IS NOT NULL
        AND status = 'pending' AND batch_id IS NOT NULL`
  );
  assert.equal(txShape.rows.length, 5);
  assert.ok(txShape.rows.every((r) => r.currency === 'UGX' && r.channel === 'sftp_file' && r.farmer_id));

  // The portal tables are never written.
  assert.equal(await snapshot('payment_lines'), before.lines);
  assert.equal(await snapshot('payment_batches'), before.batches);
  assert.ok(
    !executed.some((sql) => /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(public\.)?payment_(lines|batches)\b/i.test(sql)),
    'builder issued a write against payment_lines / payment_batches'
  );
});

test('portal: running again does not pick lines that already have a live bank transaction', async () => {
  const batch = await seedBatch();
  for (let i = 0; i < 3; i++) await seedLine(batch);

  const first = ok(await buildUgandaPortalBatches({ dryRun: false }));
  assert.equal(first.batches.length, 1);
  assert.equal(await count('bank_transactions'), 3);

  const second = ok(await buildUgandaPortalBatches({ dryRun: false }));
  assert.equal(second.candidateCount, 0);
  assert.equal(second.batches.length, 0);
  assert.equal(await count('bank_transactions'), 3);
  assert.equal(await count('equity_payment_batches'), 1);
});

test('portal: candidate SQL states every selection rule and only locks payment_lines', () => {
  const sql = UGANDA_PORTAL_CANDIDATES_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /pb\.released_at IS NOT NULL/);
  assert.match(sql, /pb\.status IN \('approved', 'sent'\)/);
  assert.match(sql, /LOWER\(TRIM\(pb\.country\)\) = 'uganda'/);
  assert.match(sql, /pb\.currency = 'UGX'/);
  assert.match(sql, /pl\.stage = 'payment_approved'/);
  assert.match(sql, /pl\.hold_kind IS NULL/);
  assert.match(sql, /bt\.payment_line_id = pl\.id AND bt\.status::text = ANY\(\$1::text\[\]\)/);
  assert.match(
    sql,
    /bf\.payment_line_id = pl\.id AND bf\.channel = 'sftp_file' AND bf\.status::text = 'failed' AND bf\.equity_error_code IS DISTINCT FROM 'UPLOAD_FAILED'/
  );
  assert.match(sql, /FOR UPDATE OF pl SKIP LOCKED/);
  assert.doesNotMatch(sql, /\b(UPDATE\s+payment_|INSERT|DELETE)\b/i);
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

test('portal: a 100-line batch splits into two files (99 + 1)', async () => {
  const batch = await seedBatch();
  for (let i = 0; i < 100; i++) await seedLine(batch, { amount: '5000.00' });

  const result = ok(
    await buildUgandaPortalBatches({ dryRun: false, now: new Date('2026-11-14T09:30:00Z') })
  );
  assert.deepEqual(result.batches.map((b) => b.rowCount), [99, 1]);
  assert.equal(result.totalAmount, 500_000);
  assert.equal(new Set(result.batches.map((b) => b.filename)).size, 2);
  assert.ok(result.batches.every((b) => b.filename.endsWith('.csv.pgp') && b.encrypted));

  const rows = await db.query<{ row_count: number; portal_batch_id: string; sequence_no: number }>(
    `SELECT row_count, portal_batch_id, sequence_no FROM equity_payment_batches ORDER BY row_count DESC`
  );
  assert.deepEqual(rows.rows.map((r) => r.row_count), [99, 1]);
  assert.ok(rows.rows.every((r) => r.portal_batch_id === batch));
  assert.deepEqual(rows.rows.map((r) => r.sequence_no).sort(), [1, 2]);
  assert.equal(await count('bank_transactions'), 100);
});

test('portal: lines of different portal batches never share a file', async () => {
  const a = await seedBatch();
  const b = await seedBatch();
  for (let i = 0; i < 3; i++) await seedLine(a);
  for (let i = 0; i < 2; i++) await seedLine(b);

  const result = ok(await buildUgandaPortalBatches({ dryRun: false }));
  assert.deepEqual(result.batches.map((x) => x.rowCount).sort(), [2, 3]);
  const rows = await db.query<{ portal_batch_id: string; row_count: number }>(
    `SELECT portal_batch_id, row_count FROM equity_payment_batches`
  );
  assert.equal(new Set(rows.rows.map((r) => r.portal_batch_id)).size, 2);
});

test('splitPlanByPortalBatch: splits per portal batch at 99 lines, keeps order', () => {
  const mk = (i: number): PlannedUgandaPayment => ({
    paymentId: `l${i}`,
    farmerId: `f${i}`,
    farmerName: 'x',
    mobile: '0751000000',
    amount: 1000,
  });
  const lines = Array.from({ length: 101 }, (_, i) => mk(i));
  const map = new Map(lines.map((l, i) => [l.paymentId, i < 100 ? 'A' : 'B']));
  const files = splitPlanByPortalBatch([lines.slice(0, 99), lines.slice(99)], map);
  assert.deepEqual(files.map((f) => [f.portalBatchId, f.payments.length]), [
    ['A', 99],
    ['A', 1],
    ['B', 1],
  ]);
  assert.throws(() => splitPlanByPortalBatch([[mk(1)]], new Map()));
});

// ---------------------------------------------------------------------------
// Skips
// ---------------------------------------------------------------------------

test('portal: unusable lines are skipped with counted reasons and never crash the run', async () => {
  const batch = await seedBatch();
  const good = await seedLine(batch, { amount: '7000.00' });
  await seedLine(batch, { amount: '10.50' }); // non-integer
  await seedLine(batch, { amount: '0.00' }); // not positive
  await seedLine(batch, { amount: '-5' }); // negative
  await seedLine(batch, { amount: null }); // missing
  await seedLine(batch, { amount: '1000.0000000000000001' }); // would round to 1000 via Number()
  await seedLine(batch, { phone: '12345' }); // invalid mobile
  await seedLine(batch, { phone: '' }); // no mobile
  await seedLine(batch, { name: '   ' }); // empty name
  await seedLine(batch, { currency: 'USD' });
  await seedLine(batch, { currency: 'ugx' }); // only exact UGX is accepted

  const result = ok(await buildUgandaPortalBatches({ dryRun: false }));
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].rowCount, 1);
  assert.equal(result.totalAmount, 7000);
  assert.equal(result.skippedCount, 10);
  assert.deepEqual(result.skippedByReason, {
    INVALID_CURRENCY: 2,
    INVALID_AMOUNT: 5,
    INVALID_MOBILE: 2,
    INVALID_NAME: 1,
  });
  const tx = await db.query<{ payment_line_id: string }>(`SELECT payment_line_id FROM bank_transactions`);
  assert.deepEqual(tx.rows.map((r) => r.payment_line_id), [good.id]);
});

test('portal: a non-integer amount is skipped, the rest of the batch still goes out', async () => {
  const batch = await seedBatch();
  await seedLine(batch, { amount: '2500.75' });
  await seedLine(batch, { amount: '2500.00' });
  const result = ok(await buildUgandaPortalBatches({ dryRun: true }));
  assert.equal(result.batches[0].rowCount, 1);
  assert.equal(result.totalAmount, 2500);
  assert.deepEqual(result.skippedByReason, { INVALID_AMOUNT: 1 });
});

test('parsePortalAmount: whole UGX only', () => {
  assert.equal(parsePortalAmount('1000'), 1000);
  assert.equal(parsePortalAmount('1000.00'), 1000);
  assert.equal(parsePortalAmount(' 1000.0 '), 1000);
  assert.equal(parsePortalAmount(1000), 1000);
  for (const bad of ['1000.01', '-1', '1e3', 'abc', '', '1000.0000000000000001', null, undefined]) {
    assert.ok(Number.isNaN(parsePortalAmount(bad as string | null | undefined)), String(bad));
  }
});

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

test('portal: EQUITY_AUTO_SEND_MAX_PAYMENTS defers the excess; deferred lines stay unsent', async () => {
  process.env.EQUITY_AUTO_SEND_MAX_PAYMENTS = '3';
  const batch = await seedBatch();
  for (let i = 0; i < 5; i++) await seedLine(batch);

  const result = ok(
    await buildUgandaPortalBatches({ dryRun: false, now: new Date('2026-11-14T09:00:00Z') })
  );
  assert.equal(result.batches.reduce((a, b) => a + b.rowCount, 0), 3);
  assert.equal(result.deferredCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.equal(await count('bank_transactions'), 3);

  // They are picked up by the next run once the earlier ones are live and the cap allows it.
  process.env.EQUITY_AUTO_SEND_MAX_PAYMENTS = '10';
  const next = ok(
    await buildUgandaPortalBatches({ dryRun: false, now: new Date('2026-11-14T09:05:00Z') })
  );
  assert.equal(next.candidateCount, 2);
  assert.equal(next.batches[0].rowCount, 2);
  assert.equal(await count('bank_transactions'), 5);
});

test('portal: EQUITY_AUTO_SEND_MAX_TOTAL defers the excess', async () => {
  process.env.EQUITY_AUTO_SEND_MAX_TOTAL = '25000';
  const batch = await seedBatch();
  for (let i = 0; i < 4; i++) await seedLine(batch, { amount: '10000.00' });

  const result = ok(await buildUgandaPortalBatches({ dryRun: true }));
  assert.equal(result.totalAmount, 20000);
  assert.equal(result.deferredCount, 2);
  assert.equal(result.batches[0].rowCount, 2);
});

// ---------------------------------------------------------------------------
// Dry run, privacy, locking
// ---------------------------------------------------------------------------

test('portal: dryRun writes nothing and returns counts, amounts and file names', async () => {
  const batch = await seedBatch();
  for (let i = 0; i < 100; i++) await seedLine(batch, { amount: '1000.00' });
  await seedLine(batch, { amount: '1.5' });

  const tables = ['bank_transactions', 'equity_payment_batches', 'audit_logs', 'equity_response_files'];
  const beforeCounts = await Promise.all(tables.map(count));
  const beforeLines = await snapshot('payment_lines');
  const beforeBatches = await snapshot('payment_batches');

  const result = ok(await buildUgandaPortalBatches({ dryRun: true }));
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.batches.map((b) => b.rowCount), [99, 1]);
  assert.ok(result.batches.every((b) => b.batchId === null && b.encrypted === undefined));
  assert.ok(result.batches.every((b) => /\.csv\.pgp$/.test(b.filename)));
  assert.equal(result.totalAmount, 100_000);
  assert.equal(result.skippedCount, 1);

  assert.deepEqual(await Promise.all(tables.map(count)), beforeCounts);
  assert.equal(await snapshot('payment_lines'), beforeLines);
  assert.equal(await snapshot('payment_batches'), beforeBatches);
  assert.ok(!executed.some((sql) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)), 'dry run issued a write');
  assert.ok(executed.includes('ROLLBACK'));
  assert.ok(!executed.includes('COMMIT'));
});

test('portal: the audit entry and console output contain no names or phone numbers', async () => {
  const batch = await seedBatch();
  const lines = [
    await seedLine(batch, { amount: '3000.00' }),
    await seedLine(batch, { amount: '3000.00' }),
    await seedLine(batch, { amount: '1.5' }), // skipped: lands in the audit sample
    await seedLine(batch, { phone: '0751999999', name: 'Skipped Person', currency: 'KES' }),
  ];

  const logged: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a: unknown[]) => logged.push(a.join(' '));
  console.error = (...a: unknown[]) => logged.push(a.join(' '));
  console.warn = (...a: unknown[]) => logged.push(a.join(' '));
  try {
    ok(await buildUgandaPortalBatches({ dryRun: false }));
  } finally {
    Object.assign(console, saved);
  }

  const audit = await db.query<{ action: string; details: string }>(`SELECT action, details FROM audit_logs`);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].action, 'banking.batch_built');
  const details = JSON.parse(audit.rows[0].details);
  assert.equal(details.source, 'portal');
  assert.deepEqual(details.portalBatchIds, [batch]);
  assert.equal(details.skippedCount, 2);

  const haystack = `${audit.rows[0].details}\n${logged.join('\n')}`;
  for (const l of [...lines, { name: 'Skipped Person', phone: '0751999999', id: '' }]) {
    assert.ok(!haystack.includes(l.name), 'a farmer name leaked');
    assert.ok(!haystack.includes(l.phone), 'a phone number leaked');
    assert.ok(!haystack.includes(l.phone.slice(1)), 'a phone number leaked');
  }
});

test('portal: returns locked and does nothing while another run holds the advisory lock', async () => {
  const batch = await seedBatch();
  await seedLine(batch);
  const real = Pool.prototype.connect;
  (Pool.prototype as unknown as { connect: unknown }).connect = async function () {
    return {
      query: async (text: string, params?: unknown[]) => {
        executed.push(text);
        if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: false }] };
        return db.query(text, params);
      },
      release: () => undefined,
    };
  };
  try {
    const result = await buildUgandaPortalBatches({ dryRun: false });
    assert.deepEqual(result, { status: 'locked' });
  } finally {
    (Pool.prototype as unknown as { connect: unknown }).connect = real;
  }
  assert.equal(await count('bank_transactions'), 0);
  assert.ok(!executed.some((sql) => /FROM payment_lines/.test(sql)));
});

// ---------------------------------------------------------------------------
// Migration 020
// ---------------------------------------------------------------------------

test('migration 020: one source per row, one live transaction per line, idempotent', async () => {
  // Idempotent: applying it again is a no-op.
  await applyMigrationFile('020_equity_portal_batches.sql');
  await applyMigrationFile('020_equity_portal_batches.sql');

  const lineId = uuidv4();
  const paymentId = uuidv4();
  await db.query('INSERT INTO payments (id) VALUES ($1)', [paymentId]);
  const insert = (pid: string | null, lid: string | null, status = 'pending') =>
    db.query(
      `INSERT INTO bank_transactions (payment_id, payment_line_id, amount, currency, recipient_phone, status)
       VALUES ($1, $2, 1000, 'UGX', '0751000000', $3)`,
      [pid, lid, status]
    );

  await assert.rejects(insert(null, null), /bank_transactions_one_source_check/);
  await assert.rejects(insert(paymentId, lineId), /bank_transactions_one_source_check/);
  await insert(paymentId, null); // payments path still works
  await insert(paymentId, null); // and is not limited by the portal index

  await insert(null, lineId, 'pending');
  await assert.rejects(insert(null, lineId, 'pending'), /idx_bank_tx_payment_line_live/);
  await assert.rejects(insert(null, lineId, 'processing'), /idx_bank_tx_payment_line_live/);
  await assert.rejects(insert(null, lineId, 'completed'), /idx_bank_tx_payment_line_live/);
  await insert(null, lineId, 'failed'); // failed rows are history, not live
  await insert(null, lineId, 'failed');

  const cols = await db.query<{ column_name: string; is_nullable: string }>(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE (table_name = 'bank_transactions' AND column_name IN ('payment_id', 'payment_line_id'))
         OR (table_name = 'equity_payment_batches' AND column_name = 'portal_batch_id')`
  );
  assert.equal(cols.rows.length, 3);
  assert.ok(cols.rows.every((c) => c.is_nullable === 'YES'));
});
