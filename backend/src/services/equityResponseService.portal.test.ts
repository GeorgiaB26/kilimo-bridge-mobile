/**
 * Response-processor tests for portal payment lines (bank_transactions.payment_line_id).
 *
 * Real SQL against PGlite (migrations 018 + 020, minimal portal tables, SQL stand-ins for
 * pl2_system_mark_lines_sent / pl2_system_record_result). SFTP is a fake. One database
 * transaction per response file, as in production (PGlite's own transaction).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import {
  createPortalTestDb,
  resetPortalTestDb,
  seedPaymentsFile,
  seedPortalFile,
  type SeededPortalFile,
} from './equityPortalTestDb';
import {
  PORTAL_NACK_FALLBACK_REASON,
  PORTAL_PSR_FALLBACK_REASON,
  runEquityResponsePoll,
  type EquityResponseDeps,
  type QueryFn,
} from './equityResponseService';
import type { SftpClientLike } from './equitySftpService';

const SAMPLES = path.resolve(__dirname, '../../data/equity_samples');
const PSR_HEADER = fs
  .readFileSync(path.join(SAMPLES, fs.readdirSync(SAMPLES).find((n) => n.startsWith('PSR_'))!), 'utf8')
  .split(/\r?\n/)[0];

const ENV: NodeJS.ProcessEnv = {
  EQUITY_SFTP_HOST: 'sftp.example.test',
  EQUITY_SFTP_USERNAME: 'drapius',
  EQUITY_SFTP_PASSWORD: 'S3cret-pass/word',
  EQUITY_SFTP_HOST_KEY_SHA256: 'SHA256:' + 'A'.repeat(43),
  EQUITY_RESPONSE_POLL_ENABLED: 'true',
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
// Response file text
// ---------------------------------------------------------------------------

const stemOf = (file: { filename: string }) => file.filename.replace(/\.csv$/i, '');

function ackText(file: { filename: string }): string {
  return `${stemOf(file)},H2H7285851653727,54307369022,,ACPT,ACPT,File accepted\n`;
}

function nackText(file: { filename: string }, records: Array<{ ref: string; desc: string }>, summary = 'All Records Failed'): string {
  const head = [stemOf(file), 'H2H7285851653727', '54307369022', '', 'RJCT', '', summary, '', '', '', '', '', '', '', '', ''].join(',');
  const rows = records.map((r, i) => `H2H7285851653727,${r.ref},BT2608043453${i},RJCT,VERFAL,${r.desc}`);
  return [head, ...rows].join('\n') + '\n';
}

type PsrRow = { txId: string; ref: string; status: string; desc?: string };

function psrText(rows: PsrRow[]): string {
  const lines = rows.map((r) => {
    const f = new Array<string>(26).fill('');
    f[0] = r.txId;
    f[1] = 'H2H2085851931618';
    f[2] = r.ref;
    f[3] = r.status;
    f[4] = 'WALLET';
    f[6] = 'UGX';
    f[7] = '10000';
    f[11] = 'UGX';
    f[12] = '10000';
    f[13] = '1';
    f[15] = '17/09/2026';
    f[22] = 'OUR';
    f[25] = r.desc ?? '';
    return f.join(',');
  });
  return [PSR_HEADER, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Fakes and helpers
// ---------------------------------------------------------------------------

class FakeSftp implements SftpClientLike {
  contents = new Map<string, Buffer>();
  on(): void {}
  async connect(): Promise<void> {}
  add(name: string, text: string): this {
    this.contents.set(name, Buffer.from(text));
    return this;
  }
  async list() {
    return [...this.contents].map(([name, buf]) => ({ name, size: buf.length, type: '-' }));
  }
  async get(remotePath: string): Promise<Buffer> {
    const buf = this.contents.get(remotePath.slice(remotePath.lastIndexOf('/') + 1));
    if (!buf) throw new Error('No such file');
    return buf;
  }
  async put(): Promise<void> {
    throw new Error('read-only');
  }
  async stat(): Promise<{ size: number }> {
    throw new Error('not used');
  }
  async delete(): Promise<void> {
    throw new Error('read-only');
  }
  async end(): Promise<void> {}
}

const plainQuery: QueryFn = async (text, params) => (await db.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>;

const transaction: NonNullable<EquityResponseDeps['transaction']> = (fn) =>
  db.transaction(async (tx) => fn(async (text, params) => (await tx.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>));

type Run = {
  result: Awaited<ReturnType<typeof runEquityResponsePoll>>;
  settled: Array<[string, string]>;
  audits: Array<Record<string, unknown>>;
  logs: string[];
};

async function poll(sftp: FakeSftp): Promise<Run & { counts: Extract<Run['result'], { status: 'ok' }> }> {
  const settled: Array<[string, string]> = [];
  const audits: Array<Record<string, unknown>> = [];
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logs.push(args.join(' '));
  let result: Run['result'];
  try {
    result = await runEquityResponsePoll(
      {},
      {
        createClient: () => sftp,
        query: plainQuery,
        transaction,
        env: ENV,
        settle: async (id, ref) => {
          settled.push([id, ref]);
          return true;
        },
        audit: (async (entry: Record<string, unknown>) => void audits.push(entry)) as unknown as EquityResponseDeps['audit'],
      }
    );
  } finally {
    console.error = original;
  }
  assert.equal(result.status, 'ok');
  return { result, counts: result as Extract<Run['result'], { status: 'ok' }>, settled, audits, logs };
}

/** State after a successful send: lines 'sent', transactions 'processing', file 'uploaded'. */
async function sent(file: SeededPortalFile): Promise<SeededPortalFile> {
  await db.query(`UPDATE payment_lines SET stage = 'sent' WHERE batch_id = $1`, [file.portalBatchId]);
  await db.query(`UPDATE payment_batches SET status = 'sent' WHERE id = $1`, [file.portalBatchId]);
  await db.query(`UPDATE bank_transactions SET status = 'processing' WHERE batch_id = $1`, [file.equityBatchId]);
  await db.query(`UPDATE equity_payment_batches SET status = 'uploaded' WHERE id = $1`, [file.equityBatchId]);
  return file;
}

async function sentFile(lines: number): Promise<SeededPortalFile> {
  return sent(await seedPortalFile(db, lines));
}

type LineState = { stage: string; fail_reason: string | null; bank_txn: string | null };
async function line(id: string): Promise<LineState> {
  return (await db.query<LineState>('SELECT stage, fail_reason, bank_txn FROM payment_lines WHERE id = $1', [id])).rows[0];
}

async function tx(id: string) {
  return (
    await db.query<{ status: string; equity_error_code: string | null; equity_transaction_id: string | null }>(
      'SELECT status::text AS status, equity_error_code, equity_transaction_id FROM bank_transactions WHERE id = $1',
      [id]
    )
  ).rows[0];
}

async function batchStatus(id: string): Promise<string> {
  return (await db.query<{ status: string }>('SELECT status FROM equity_payment_batches WHERE id = $1', [id])).rows[0].status;
}

async function recordCalls() {
  return (
    await db.query<{ args: { line: string; status: string; reason: string | null; txn: string | null }; result: string | null }>(
      `SELECT args, result FROM pl2_calls WHERE fn = 'record_result' ORDER BY n`
    )
  ).rows;
}

async function storedResponseFiles(): Promise<number> {
  return (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM equity_response_files')).rows[0].n;
}

const psrName = (f: { filename: string }, suffix = '') => `PSR_${stemOf(f)}${suffix}.csv`;
const nackName = (f: { filename: string }) => `NACK__${stemOf(f)}.csv`;
const ackName = (f: { filename: string }) => `ACK__${stemOf(f)}.csv`;

// ---------------------------------------------------------------------------
// ACK
// ---------------------------------------------------------------------------

test('portal ACK: batch accepted as today, lines stay sent, the portal is not called', async () => {
  const file = await sentFile(2);
  const { counts } = await poll(new FakeSftp().add(ackName(file), ackText(file)));

  assert.equal(counts.filesProcessed, 1);
  assert.equal(counts.errors, 0);
  assert.equal(await batchStatus(file.equityBatchId), 'accepted');
  assert.equal((await line(file.lineIds[0])).stage, 'sent');
  assert.equal((await tx(file.txIds[0])).status, 'processing');
  assert.equal((await db.query('SELECT 1 FROM pl2_calls')).rows.length, 0);
});

// ---------------------------------------------------------------------------
// NACK
// ---------------------------------------------------------------------------

test('portal NACK: every line is recorded failed (bank reason, or the file-level fallback)', async () => {
  const file = await sentFile(3);
  const text = nackText(file, [
    { ref: file.customerReferences[0], desc: 'Back value dated transactions not accepted.' },
    { ref: file.customerReferences[1], desc: '' },
  ]);
  const { counts, settled } = await poll(new FakeSftp().add(nackName(file), text));

  assert.equal(counts.errors, 0);
  assert.equal(counts.failed, 3);
  assert.equal(counts.needsReview, 0);
  assert.deepEqual(settled, [], 'settleTransferredPayment is never called for lines');

  const reasons = new Map<string, string | null>();
  for (const c of await recordCalls()) {
    assert.equal(c.args.status, 'failed');
    assert.equal(c.args.txn, null);
    reasons.set(c.args.line, c.args.reason);
    assert.equal(c.result, 'failed');
  }
  assert.equal(reasons.size, 3);
  assert.equal(reasons.get(file.lineIds[0]), 'Back value dated transactions not accepted.');
  assert.equal(reasons.get(file.lineIds[1]), PORTAL_NACK_FALLBACK_REASON);
  assert.equal(reasons.get(file.lineIds[2]), PORTAL_NACK_FALLBACK_REASON);
  assert.equal(PORTAL_NACK_FALLBACK_REASON, 'File rejected by Equity');

  for (let i = 0; i < 3; i++) {
    assert.equal((await line(file.lineIds[i])).stage, 'failed');
    assert.equal((await tx(file.txIds[i])).status, 'failed');
  }
  assert.equal(await batchStatus(file.equityBatchId), 'rejected');
});

test('portal NACK with no per-line records still fails all lines', async () => {
  const file = await sentFile(2);
  const { counts } = await poll(new FakeSftp().add(nackName(file), nackText(file, [])));
  assert.equal(counts.failed, 2);
  assert.deepEqual(
    (await recordCalls()).map((c) => c.args.reason),
    [PORTAL_NACK_FALLBACK_REASON, PORTAL_NACK_FALLBACK_REASON]
  );
  assert.equal((await tx(file.txIds[1])).status, 'failed');
});

// ---------------------------------------------------------------------------
// PSR
// ---------------------------------------------------------------------------

test('portal PSR Success: record_result paid with the bank transaction id; transaction completed; no settle', async () => {
  const file = await sentFile(2);
  const text = psrText([
    { txId: 'BT-AAA-1', ref: file.customerReferences[0], status: 'Success', desc: 'Success' },
    { txId: 'BT-BBB-2', ref: file.customerReferences[1], status: 'Success', desc: 'Success' },
  ]);
  const { counts, settled } = await poll(new FakeSftp().add(psrName(file), text));

  assert.equal(counts.success, 2);
  assert.equal(counts.failed, 0);
  assert.equal(counts.needsReview, 0);
  assert.equal(counts.errors, 0);
  assert.deepEqual(settled, []);

  const calls = await recordCalls();
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((c) => [c.args.line, c.args.status, c.args.reason, c.args.txn]).sort(),
    [
      [file.lineIds[0], 'paid', null, 'BT-AAA-1'],
      [file.lineIds[1], 'paid', null, 'BT-BBB-2'],
    ].sort()
  );
  assert.equal((await line(file.lineIds[0])).stage, 'paid');
  assert.equal((await line(file.lineIds[0])).bank_txn, 'BT-AAA-1');
  assert.equal((await tx(file.txIds[0])).status, 'completed');
  assert.equal((await tx(file.txIds[0])).equity_transaction_id, 'BT-AAA-1');
  assert.equal(await batchStatus(file.equityBatchId), 'settled');
});

test('portal PSR Failed: record_result failed with the bank reason, fallback when there is none', async () => {
  const file = await sentFile(2);
  const text = psrText([
    { txId: 'BT-1', ref: file.customerReferences[0], status: 'Failed', desc: 'Insufficient funds in wallet' },
    { txId: 'BT-2', ref: file.customerReferences[1], status: 'Failed', desc: '' },
  ]);
  const { counts, settled } = await poll(new FakeSftp().add(psrName(file), text));

  assert.equal(counts.failed, 2);
  assert.equal(counts.success, 0);
  assert.deepEqual(settled, []);

  const byLine = new Map((await recordCalls()).map((c) => [c.args.line, c.args]));
  assert.deepEqual(
    [byLine.get(file.lineIds[0])!.status, byLine.get(file.lineIds[0])!.reason, byLine.get(file.lineIds[0])!.txn],
    ['failed', 'Insufficient funds in wallet', null]
  );
  assert.deepEqual(
    [byLine.get(file.lineIds[1])!.status, byLine.get(file.lineIds[1])!.reason],
    ['failed', PORTAL_PSR_FALLBACK_REASON]
  );
  assert.equal(PORTAL_PSR_FALLBACK_REASON, 'Payment failed at the bank');
  assert.equal((await line(file.lineIds[0])).stage, 'failed');
  assert.equal((await tx(file.txIds[0])).status, 'failed');
  assert.equal(await batchStatus(file.equityBatchId), 'failed');
});

test('portal PSR: unknown and Verification Failure leave the line at sent and count needsReview', async () => {
  const file = await sentFile(3);
  const text = psrText([
    { txId: 'BT-1', ref: file.customerReferences[0], status: 'Verification Failure', desc: 'Name mismatch' },
    { txId: 'BT-2', ref: file.customerReferences[1], status: 'Pending approval' },
    { txId: 'BT-3', ref: file.customerReferences[2], status: 'Success', desc: 'Success' },
  ]);
  const { counts } = await poll(new FakeSftp().add(psrName(file), text));

  assert.equal(counts.needsReview, 2);
  assert.equal(counts.success, 1);
  assert.equal(counts.failed, 0);
  assert.equal((await line(file.lineIds[0])).stage, 'sent');
  assert.equal((await line(file.lineIds[1])).stage, 'sent');
  assert.equal((await tx(file.txIds[0])).status, 'processing');
  assert.equal((await tx(file.txIds[1])).status, 'processing');
  assert.equal((await line(file.lineIds[2])).stage, 'paid');
  const calls = await recordCalls();
  assert.deepEqual(calls.map((c) => c.args.line), [file.lineIds[2]], 'no verdict is sent for the unclear rows');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('repeated and duplicate files are harmless; a null return from the portal is ignored', async () => {
  const file = await sentFile(2);
  const text = psrText([
    { txId: 'BT-1', ref: file.customerReferences[0], status: 'Success', desc: 'Success' },
    { txId: 'BT-2', ref: file.customerReferences[1], status: 'Failed', desc: 'Declined' },
  ]);
  const sftp = new FakeSftp().add(psrName(file), text);

  const first = await poll(sftp);
  assert.equal(first.counts.filesProcessed, 1);
  assert.equal((await recordCalls()).length, 2);

  // Same file again: already stored by name.
  const second = await poll(sftp);
  assert.equal(second.counts.filesNew, 0);

  // Same content under another name: stored-by-hash duplicate.
  sftp.add(psrName(file, '_copy'), text);
  const third = await poll(sftp);
  assert.equal(third.counts.duplicates, 1);
  assert.equal(third.counts.filesProcessed, 0);

  // Different content naming the same rows again: transactions are final, nothing is re-sent.
  sftp.add(psrName(file, '_again'), text.replace('BT-1', 'BT-1b'));
  const fourth = await poll(sftp);
  assert.equal(fourth.counts.errors, 0);
  assert.equal(fourth.counts.success, 0);
  assert.equal(fourth.counts.failed, 0);

  assert.equal((await recordCalls()).length, 2, 'no extra pl2 calls');
  assert.equal((await line(file.lineIds[0])).stage, 'paid');
  assert.equal((await line(file.lineIds[1])).stage, 'failed');

  // The portal answers null when the line is not at 'sent' (e.g. changed there by a person):
  // that is not an error and the bank transaction is still recorded.
  const other = await sentFile(1);
  await db.query(`UPDATE payment_lines SET stage = 'payment_approved' WHERE id = $1`, [other.lineIds[0]]);
  const nullRun = await poll(
    new FakeSftp().add(psrName(other), psrText([{ txId: 'BT-9', ref: other.customerReferences[0], status: 'Success', desc: 'Success' }]))
  );
  assert.equal(nullRun.counts.errors, 0);
  assert.equal(nullRun.counts.success, 1);
  assert.equal((await tx(other.txIds[0])).status, 'completed');
  assert.equal((await line(other.lineIds[0])).stage, 'payment_approved');
  const last = (await recordCalls()).at(-1)!;
  assert.equal(last.result, null);
});

// ---------------------------------------------------------------------------
// One transaction per file
// ---------------------------------------------------------------------------

test('a failing pl2 call rolls that file back, counts an error and the other files still go through', async () => {
  const bad = await sentFile(2);
  const good = await sentFile(2);
  await db.query('INSERT INTO pl2_poison (id) VALUES ($1)', [bad.lineIds[1]]); // second line of the bad file

  const sftp = new FakeSftp()
    .add(
      psrName(bad),
      psrText([
        { txId: 'BT-B1', ref: bad.customerReferences[0], status: 'Success', desc: 'Success' },
        { txId: 'BT-B2', ref: bad.customerReferences[1], status: 'Success', desc: 'Success' },
      ])
    )
    .add(
      psrName(good),
      psrText([
        { txId: 'BT-G1', ref: good.customerReferences[0], status: 'Success', desc: 'Success' },
        { txId: 'BT-G2', ref: good.customerReferences[1], status: 'Success', desc: 'Success' },
      ])
    );

  const { counts, logs, audits } = await poll(sftp);

  assert.equal(counts.errors, 1);
  assert.equal(counts.filesProcessed, 1);
  assert.equal(counts.success, 2);

  // Bad file: nothing from it survived, including its first (successful) line and the stored file.
  assert.equal((await line(bad.lineIds[0])).stage, 'sent');
  assert.equal((await tx(bad.txIds[0])).status, 'processing');
  assert.equal(await storedResponseFiles(), 1);
  // Good file: fully applied.
  assert.equal((await line(good.lineIds[0])).stage, 'paid');
  assert.equal((await tx(good.txIds[1])).status, 'completed');

  // Logs and audit: counts and file names only; no names, phones or bank ids.
  const text = logs.join('\n') + JSON.stringify(audits);
  assert.ok(!/0751000000|Zuberi|BT-B|BT-G/.test(text));
  assert.equal(audits.length, 1);
  assert.deepEqual((audits[0].details as Record<string, number>).errors, 1);

  // Fixed: the next poll picks the file up again.
  await db.query('DELETE FROM pl2_poison');
  const retry = await poll(sftp);
  assert.equal(retry.counts.errors, 0);
  assert.equal(retry.counts.filesProcessed, 1);
  assert.equal((await line(bad.lineIds[1])).stage, 'paid');
});

// ---------------------------------------------------------------------------
// Payments path unchanged
// ---------------------------------------------------------------------------

test('payments-table file: PSR still settles through settleTransferredPayment and never calls the portal', async () => {
  const pay = await seedPaymentsFile(db, 2);
  await db.query(`UPDATE bank_transactions SET status = 'processing' WHERE batch_id = $1`, [pay.equityBatchId]);
  await db.query(`UPDATE equity_payment_batches SET status = 'uploaded' WHERE id = $1`, [pay.equityBatchId]);

  const text = psrText([
    { txId: 'BT-P1', ref: pay.customerReferences[0], status: 'Success', desc: 'Success' },
    { txId: 'BT-P2', ref: pay.customerReferences[1], status: 'Failed', desc: 'Declined' },
  ]);
  const { counts, settled } = await poll(new FakeSftp().add(psrName(pay), text));

  assert.equal(counts.success, 1);
  assert.equal(counts.failed, 1);
  assert.equal(counts.errors, 0);
  assert.deepEqual(settled, [[pay.paymentIds[0], 'BT-P1']]);
  assert.equal((await tx(pay.txIds[0])).status, 'completed');
  assert.equal((await tx(pay.txIds[1])).status, 'failed');
  assert.equal((await db.query('SELECT 1 FROM pl2_calls')).rows.length, 0);
});

test('payments-table NACK: only the named rows fail and the rest are flagged, as before', async () => {
  const pay = await seedPaymentsFile(db, 3);
  await db.query(`UPDATE bank_transactions SET status = 'processing' WHERE batch_id = $1`, [pay.equityBatchId]);
  await db.query(`UPDATE equity_payment_batches SET status = 'uploaded' WHERE id = $1`, [pay.equityBatchId]);

  const { counts } = await poll(
    new FakeSftp().add(nackName(pay), nackText(pay, [{ ref: pay.customerReferences[0], desc: 'Rejected' }]))
  );
  assert.equal(counts.failed, 1);
  assert.equal(counts.needsReview, 2);
  assert.equal((await tx(pay.txIds[1])).status, 'processing');
  assert.equal((await db.query('SELECT 1 FROM pl2_calls')).rows.length, 0);
});
