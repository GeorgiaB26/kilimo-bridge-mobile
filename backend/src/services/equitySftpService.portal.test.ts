/**
 * Sender tests for files built from portal payment lines (bank_transactions.payment_line_id).
 *
 * Real SQL against PGlite (migrations 018 + 020, minimal portal tables, SQL stand-ins for
 * pl2_system_mark_lines_sent / pl2_system_record_result). The SFTP client is a fake.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { UGANDA_PORTAL_CANDIDATES_SQL, type BuiltUgandaBatch } from './equityBatchService';
import {
  createPortalTestDb,
  resetPortalTestDb,
  seedPaymentsFile,
  seedPortalFile,
  type SeededPortalFile,
} from './equityPortalTestDb';
import {
  OperationTimeoutError,
  PORTAL_SEND_ERROR_UPLOAD_FAILED,
  PORTAL_SEND_ERROR_UPLOAD_UNCERTAIN,
  sendBuiltBatches,
  type EquitySftpDeps,
  type SftpClientLike,
} from './equitySftpService';

const PASSWORD = 'S3cret-pass/word';
const HOST_KEY = Buffer.from('pretend-this-is-the-server-host-key');
const FINGERPRINT = `SHA256:${createHash('sha256').update(HOST_KEY).digest('base64').replace(/=+$/, '')}`;
const ENV: NodeJS.ProcessEnv = {
  EQUITY_SFTP_HOST: 'sftp.example.test',
  EQUITY_SFTP_USERNAME: 'drapius',
  EQUITY_SFTP_PASSWORD: PASSWORD,
  EQUITY_SFTP_HOST_KEY_SHA256: FINGERPRINT,
};

let db: PGlite;

before(async () => {
  db = await createPortalTestDb();
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetPortalTestDb(db);
});

// ---------------------------------------------------------------------------
// Fakes and helpers
// ---------------------------------------------------------------------------

class FakeClient implements SftpClientLike {
  putCalls: string[] = [];
  files = new Map<string, number>();
  constructor(
    private readonly putError?: (name: string, call: number) => Error | null,
    private readonly statThrows?: Error
  ) {}
  on(): void {}
  async connect(): Promise<void> {}
  async put(input: Buffer, remotePath: string): Promise<void> {
    const err = this.putError?.(remotePath, this.putCalls.length) ?? null;
    this.putCalls.push(remotePath);
    if (err) throw err;
    this.files.set(remotePath, input.length);
  }
  async stat(remotePath: string): Promise<{ size: number }> {
    if (this.statThrows) throw this.statThrows;
    const size = this.files.get(remotePath);
    if (size === undefined) throw Object.assign(new Error('No such file'), { code: 2 });
    return { size };
  }
  async list(): Promise<Array<{ name: string; size: number }>> {
    return [];
  }
  async get(): Promise<Buffer> {
    throw new Error('not used');
  }
  async delete(): Promise<void> {}
  async end(): Promise<void> {}
}

const dbQuery: NonNullable<EquitySftpDeps['query']> = async (text, params) =>
  (await db.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>;

function built(file: { uploadName: string; equityBatchId: string }, rows: number): BuiltUgandaBatch {
  return {
    batchId: file.equityBatchId,
    filename: file.uploadName,
    rowCount: rows,
    totalAmount: rows * 10000,
    encrypted: `-----BEGIN PGP MESSAGE-----\nbody-${file.uploadName}\n-----END PGP MESSAGE-----\n`,
  };
}

function send(client: FakeClient, batches: BuiltUgandaBatch[], extra: EquitySftpDeps = {}) {
  return sendBuiltBatches(batches, { createClient: () => client, query: dbQuery, env: ENV, ...extra });
}

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}

async function sendError(portalBatchId: string): Promise<string | null> {
  return (await one<{ send_error: string | null }>('SELECT send_error FROM payment_batches WHERE id = $1', [
    portalBatchId,
  ])).send_error;
}

async function stages(file: SeededPortalFile): Promise<string[]> {
  const res = await db.query<{ stage: string }>(
    'SELECT stage FROM payment_lines WHERE batch_id = $1 ORDER BY id',
    [file.portalBatchId]
  );
  return res.rows.map((r) => r.stage);
}

async function txStatuses(equityBatchId: string): Promise<string[]> {
  const res = await db.query<{ status: string }>(
    'SELECT status::text AS status FROM bank_transactions WHERE batch_id = $1',
    [equityBatchId]
  );
  return [...new Set(res.rows.map((r) => r.status))].sort();
}

async function equityBatch(id: string) {
  return one<{ status: string; error_message: string | null; uploaded_at: Date | null }>(
    'SELECT status, error_message, uploaded_at FROM equity_payment_batches WHERE id = $1',
    [id]
  );
}

async function pl2Calls(fn?: string) {
  const res = await db.query<{ fn: string; args: Record<string, unknown>; result: string | null }>(
    `SELECT fn, args, result FROM pl2_calls ${fn ? 'WHERE fn = $1' : ''} ORDER BY n`,
    fn ? [fn] : []
  );
  return res.rows;
}

/** Lines that the next build would pick up again (the portal candidate query, real SQL). */
async function candidatePool(): Promise<string[]> {
  const res = await db.query<{ line_id: string }>(UGANDA_PORTAL_CANDIDATES_SQL, [
    ['pending', 'processing', 'completed'],
  ]);
  return res.rows.map((r) => r.line_id);
}

// ---------------------------------------------------------------------------
// Certain success
// ---------------------------------------------------------------------------

test('portal send: success marks the lines sent, sets transactions processing and clears send_error', async () => {
  const file = await seedPortalFile(db, 3);
  await db.query(`UPDATE payment_batches SET send_error = $2 WHERE id = $1`, [
    file.portalBatchId,
    'Upload to the bank failed. The lines will be sent again in the next cycle.',
  ]);
  const client = new FakeClient();

  const result = await send(client, [built(file, 3)]);

  assert.equal(result.uploaded, 1);
  assert.equal(result.unrecorded, 0);
  assert.equal(client.putCalls.length, 1);

  assert.deepEqual(await stages(file), ['sent', 'sent', 'sent']);
  assert.equal((await one<{ status: string }>('SELECT status FROM payment_batches WHERE id = $1', [file.portalBatchId])).status, 'sent');
  assert.equal(await sendError(file.portalBatchId), null);
  assert.deepEqual(await txStatuses(file.equityBatchId), ['processing']);
  const eb = await equityBatch(file.equityBatchId);
  assert.equal(eb.status, 'uploaded');
  assert.ok(eb.uploaded_at);

  const calls = await pl2Calls('mark_lines_sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.batch, file.portalBatchId);
  assert.equal(calls[0].args.file_ref, file.uploadName);
  assert.deepEqual([...(calls[0].args.lines as string[])].sort(), [...file.lineIds].sort());
});

test('portal send: a repeated send of the same (already uploaded) file changes nothing', async () => {
  const file = await seedPortalFile(db, 2);
  await send(new FakeClient(), [built(file, 2)]);
  const second = new FakeClient();
  const result = await send(second, [built(file, 2)]);

  // The batch is no longer 'generated', so it is reported unrecorded, but nothing is damaged.
  assert.equal(result.unrecorded, 1);
  assert.deepEqual(await stages(file), ['sent', 'sent']);
  assert.deepEqual(await txStatuses(file.equityBatchId), ['processing']);
});

// ---------------------------------------------------------------------------
// Certain failure
// ---------------------------------------------------------------------------

test('portal send: a certain upload failure sets send_error and releases the lines', async () => {
  const file = await seedPortalFile(db, 2);
  assert.deepEqual((await candidatePool()).length, 0, 'pending transactions hold the lines');

  const client = new FakeClient(() => new Error(`write failed to sftp.example.test:22 /upload/OUTBOUND/${file.uploadName}`));
  const result = await send(client, [built(file, 2)]);

  assert.equal(result.failed, 1);
  assert.equal(result.uncertain, 0);
  assert.equal(client.putCalls.length, 1);

  assert.deepEqual(await txStatuses(file.equityBatchId), ['failed']);
  const codes = await db.query<{ equity_error_code: string }>(
    'SELECT DISTINCT equity_error_code FROM bank_transactions WHERE batch_id = $1',
    [file.equityBatchId]
  );
  assert.deepEqual(codes.rows.map((r) => r.equity_error_code), ['UPLOAD_FAILED']);
  assert.equal((await equityBatch(file.equityBatchId)).status, 'failed');

  const message = await sendError(file.portalBatchId);
  assert.equal(message, PORTAL_SEND_ERROR_UPLOAD_FAILED);
  assert.ok(!/sftp\.example|upload\/|OUTBOUND|drapius|S3cret|\d/i.test(message!), 'no host, path, credentials or numbers');

  // Lines never left payment_approved and are back in the candidate pool.
  assert.deepEqual(await stages(file), ['payment_approved', 'payment_approved']);
  assert.deepEqual((await candidatePool()).sort(), [...file.lineIds].sort());
  assert.equal((await pl2Calls()).length, 0, 'the portal is not told anything was sent');
});

test('portal send: connection failure releases every portal batch with a send_error', async () => {
  const a = await seedPortalFile(db, 1);
  const b = await seedPortalFile(db, 1);
  const result = await send(new FakeClient(), [built(a, 1), built(b, 1)], {
    env: { ...ENV, EQUITY_SFTP_HOST: undefined },
  });

  assert.equal(result.failed, 2);
  for (const f of [a, b]) {
    assert.deepEqual(await txStatuses(f.equityBatchId), ['failed']);
    assert.equal(await sendError(f.portalBatchId), PORTAL_SEND_ERROR_UPLOAD_FAILED);
  }
  assert.deepEqual((await candidatePool()).length, 2);
});

// ---------------------------------------------------------------------------
// Uncertain
// ---------------------------------------------------------------------------

test('portal send: an uncertain upload sets the message, holds the lines and is never retried', async () => {
  const file = await seedPortalFile(db, 2);
  const next = await seedPortalFile(db, 1);
  const client = new FakeClient(() => new OperationTimeoutError('upload', 60_000));

  const result = await send(client, [built(file, 2), built(next, 1)]);

  assert.equal(result.uncertain, 1);
  assert.equal(client.putCalls.length, 1, 'one attempt, no retry, and the run stops');
  assert.equal(await sendError(file.portalBatchId), PORTAL_SEND_ERROR_UPLOAD_UNCERTAIN);
  assert.equal(await sendError(file.portalBatchId), 'Upload status unclear. Check the Equity folders before retrying.');

  // Held: batch stays generated, transactions stay pending, lines are not in the pool.
  assert.equal((await equityBatch(file.equityBatchId)).status, 'generated');
  assert.deepEqual(await txStatuses(file.equityBatchId), ['pending']);
  assert.deepEqual(await stages(file), ['payment_approved', 'payment_approved']);
  assert.ok(!(await candidatePool()).includes(file.lineIds[0]));
  assert.equal((await pl2Calls()).length, 0);

  // The batch never reached is released normally.
  assert.deepEqual(await txStatuses(next.equityBatchId), ['failed']);

  // A second run does not upload the held file again: its lines are excluded from new builds.
  const again = new FakeClient();
  await send(again, []);
  assert.equal(again.putCalls.length, 0);
});

test('portal send: an unverifiable upload (stat fails after put error) is uncertain', async () => {
  const file = await seedPortalFile(db, 1);
  const client = new FakeClient(() => new Error('connection reset'), new Error('connection lost'));
  const result = await send(client, [built(file, 1)]);
  assert.equal(result.uncertain, 1);
  assert.equal(await sendError(file.portalBatchId), PORTAL_SEND_ERROR_UPLOAD_UNCERTAIN);
  assert.deepEqual(await txStatuses(file.equityBatchId), ['pending']);
});

// ---------------------------------------------------------------------------
// Database failure after a certain upload
// ---------------------------------------------------------------------------

test('portal send: if marking the lines sent fails after the upload, it is unrecorded and never retried', async () => {
  const file = await seedPortalFile(db, 2);
  const next = await seedPortalFile(db, 1);
  await db.query('INSERT INTO pl2_poison (id) VALUES ($1)', [file.portalBatchId]);
  const client = new FakeClient();

  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.join(' '));
  let result;
  try {
    result = await send(client, [built(file, 2), built(next, 1)]);
  } finally {
    console.error = original;
  }

  assert.equal(result.unrecorded, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(result.results[0].recorded, false);
  assert.equal(client.putCalls.length, 1, 'never uploaded again, and the run stops');

  // Not released: the file is on the server. Transactions stay pending so the lines stay held.
  assert.deepEqual(await txStatuses(file.equityBatchId), ['pending']);
  assert.ok(!(await candidatePool()).includes(file.lineIds[0]));
  assert.deepEqual(await stages(file), ['payment_approved', 'payment_approved']);

  assert.ok(logged.some((l) => /CRITICAL/.test(l) && /UPLOADED/.test(l)), 'logged loudly');
  const all = logged.join('\n');
  assert.ok(!all.includes(PASSWORD));
});

// ---------------------------------------------------------------------------
// Payments path is unchanged
// ---------------------------------------------------------------------------

test('payments-table file: no pl2 call, no payment_batches write, same end state as before', async () => {
  await db.query(
    `INSERT INTO payment_batches (id, batch_ref, status, send_error) VALUES (gen_random_uuid(), 'untouched', 'approved', 'keep me')`
  );
  const ok = await seedPaymentsFile(db, 2);
  const result = await send(new FakeClient(), [built(ok, 2)]);
  assert.equal(result.uploaded, 1);
  assert.equal(result.unrecorded, 0);
  assert.deepEqual(await txStatuses(ok.equityBatchId), ['processing']);
  assert.equal((await equityBatch(ok.equityBatchId)).status, 'uploaded');

  const bad = await seedPaymentsFile(db, 1);
  const failed = await send(new FakeClient(() => new Error('boom')), [built(bad, 1)]);
  assert.equal(failed.failed, 1);
  assert.deepEqual(await txStatuses(bad.equityBatchId), ['failed']);

  const unclear = await seedPaymentsFile(db, 1);
  const uncertain = await send(new FakeClient(() => new OperationTimeoutError('upload', 1)), [built(unclear, 1)]);
  assert.equal(uncertain.uncertain, 1);
  assert.deepEqual(await txStatuses(unclear.equityBatchId), ['pending']);

  assert.equal((await pl2Calls()).length, 0);
  assert.equal((await one<{ send_error: string }>(`SELECT send_error FROM payment_batches WHERE batch_ref = 'untouched'`)).send_error, 'keep me');
});

test('portal send: a file mixing portal lines and payments is not uploaded', async () => {
  const file = await seedPortalFile(db, 1);
  await db.query(`INSERT INTO payments (id, status) VALUES (gen_random_uuid(), 'pending')`);
  await db.query(
    `INSERT INTO bank_transactions (payment_id, amount, currency, recipient_phone, status, batch_id, customer_reference, channel)
     SELECT id, 1, 'UGX', '0', 'pending', $1, 'MIXEDREF', 'sftp_file' FROM payments LIMIT 1`,
    [file.equityBatchId]
  );
  const client = new FakeClient();
  const originalError = console.error;
  console.error = () => undefined;
  let result;
  try {
    result = await send(client, [built(file, 2)]);
  } finally {
    console.error = originalError;
  }
  assert.equal(client.putCalls.length, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(await txStatuses(file.equityBatchId), ['failed']);
});
