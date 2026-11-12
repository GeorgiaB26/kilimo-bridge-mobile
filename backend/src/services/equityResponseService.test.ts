import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  ACK_BATCH_SQL,
  BATCH_TX_COUNTS_SQL,
  classifyInboundFile,
  COMPLETE_TX_SQL,
  FAIL_TX_SQL,
  FIND_BATCH_BY_FILE_REFERENCE_SQL,
  FIND_BATCH_BY_STEM_SQL,
  INSERT_RESPONSE_FILE_SQL,
  NACK_BATCH_SQL,
  PSR_BATCH_SQL,
  pickInboundResponseFiles,
  runEquityResponsePoll,
  SELECT_TX_SQL,
  STORED_FILENAMES_SQL,
  stemFromResponseFilename,
  type EquityResponseDeps,
  type QueryFn,
} from './equityResponseService';
import { mapPsrStatus } from './equityResponseParsers';
import type { SftpClientLike } from './equitySftpService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLES = path.resolve(__dirname, '../../data/equity_samples');
const sampleNames = fs.readdirSync(SAMPLES);
const ACK_NAME = sampleNames.find((n) => n.startsWith('ACK__'))!;
const NACK_NAME = sampleNames.find((n) => n.startsWith('NACK__'))!;
const PSR_NAME = sampleNames.find((n) => n.startsWith('PSR_'))!;
const OUTBOUND_SAMPLE = sampleNames.find((n) => n.startsWith('TMP224_'))!;
const sample = (name: string) => fs.readFileSync(path.join(SAMPLES, name));
const PSR_HEADER = sample(PSR_NAME).toString('utf8').split(/\r?\n/)[0];

const PASSWORD = 'S3cret-pass/word';
const FINGERPRINT = 'SHA256:' + 'A'.repeat(43);
const ENV: NodeJS.ProcessEnv = {
  EQUITY_SFTP_HOST: 'sftp.example.test',
  EQUITY_SFTP_USERNAME: 'drapius',
  EQUITY_SFTP_PASSWORD: PASSWORD,
  EQUITY_SFTP_HOST_KEY_SHA256: FINGERPRINT,
  EQUITY_RESPONSE_POLL_ENABLED: 'true',
};
const INBOUND = '/upload/INBOUND';

/** Uganda-style outbound file + the PSR / ACK names Equity derives from it. */
const UG_BATCH_FILE = 'TMP224_56010646936_56010646936_MD_17092026_DRAPIUSUG_ALL20260917120000.csv';
const UG_STEM = '56010646936_56010646936_TMP224_56010646936_56010646936_MD_17092026_DRAPIUSUG_ALL20260917120000';
const UG_PSR_NAME = `PSR_${UG_STEM}.csv`;
const UG_ACK_NAME = `ACK__${UG_STEM}.csv`;
const UG_REF_1 = 'DU2026091712000001';
const UG_REF_2 = 'DU2026091712000002';

type PsrRow = {
  txId: string;
  ref: string;
  status: string;
  type?: string;
  code?: string;
  desc?: string;
};

/** A 26-column PSR (same header as Equity's sample) with Uganda-style rows. */
function psrText(rows: PsrRow[]): string {
  const lines = rows.map((r) => {
    const f = new Array<string>(26).fill('');
    f[0] = r.txId;
    f[1] = 'H2H2085851931618';
    f[2] = r.ref;
    f[3] = r.status;
    f[4] = r.type ?? 'WALLET';
    f[5] = '012345677777';
    f[6] = 'UGX';
    f[7] = '1000';
    f[8] = 'Test Farmer';
    f[9] = '0751000000';
    f[11] = 'UGX';
    f[12] = '1000';
    f[13] = '1';
    f[15] = '17/09/2026';
    f[22] = 'OUR';
    f[24] = r.code ?? '';
    f[25] = r.desc ?? '';
    return f.join(',');
  });
  return [PSR_HEADER, ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// In-memory database (answers the exported SQL statements by identity)
// ---------------------------------------------------------------------------

type Batch = {
  id: string;
  filename: string;
  status: string;
  ack_code: string | null;
  file_reference: string | null;
  acked_at: Date | null;
  nack_summary: string | null;
  nacked_at: Date | null;
  psr_received_at: Date | null;
};
type Tx = {
  id: string;
  batch_id: string;
  customer_reference: string;
  payment_id: string;
  status: string;
  equity_error_code: string | null;
  equity_error_description: string | null;
  equity_transaction_id: string | null;
  equity_file_reference: string | null;
  equity_payment_type: string | null;
  completed_at: Date | null;
};
type StoredFile = {
  id: string;
  batch_id: string | null;
  kind: string;
  filename: string;
  sha: string;
  raw_text: string;
  summary: unknown;
};

class FakeDb {
  batches: Batch[] = [];
  txs: Tx[] = [];
  files: StoredFile[] = [];
  statements: string[] = [];

  addBatch(id: string, filename: string, status = 'uploaded'): Batch {
    const b: Batch = {
      id,
      filename,
      status,
      ack_code: null,
      file_reference: null,
      acked_at: null,
      nack_summary: null,
      nacked_at: null,
      psr_received_at: null,
    };
    this.batches.push(b);
    return b;
  }

  addTx(batchId: string, ref: string, status = 'processing'): Tx {
    const t: Tx = {
      id: `tx-${batchId}-${ref}`,
      batch_id: batchId,
      customer_reference: ref,
      payment_id: `pay-${batchId}-${ref}`,
      status,
      equity_error_code: null,
      equity_error_description: null,
      equity_transaction_id: null,
      equity_file_reference: null,
      equity_payment_type: null,
      completed_at: null,
    };
    this.txs.push(t);
    return t;
  }

  tx(batchId: string, ref: string): Tx {
    return this.txs.find((t) => t.batch_id === batchId && t.customer_reference === ref)!;
  }
  batch(id: string): Batch {
    return this.batches.find((b) => b.id === id)!;
  }

  query: QueryFn = async (text, params = []) => {
    this.statements.push(text);
    switch (text) {
      case STORED_FILENAMES_SQL: {
        const names = params[0] as string[];
        return this.files.filter((f) => names.includes(f.filename)).map((f) => ({ filename: f.filename }));
      }
      case FIND_BATCH_BY_STEM_SQL: {
        const p = String(params[0]);
        return this.batches
          .map((b) => ({ b, stem: b.filename.replace(/\.csv$/i, '') }))
          .filter(({ stem }) => stem === p || (p.length > stem.length && p.endsWith(`_${stem}`)))
          .map(({ b, stem }) => ({ id: b.id, status: b.status, exact: stem === p }));
      }
      case FIND_BATCH_BY_FILE_REFERENCE_SQL:
        return this.batches
          .filter((b) => b.file_reference === params[0])
          .map((b) => ({ id: b.id, status: b.status, exact: true }));
      case INSERT_RESPONSE_FILE_SQL: {
        const sha = String(params[3]);
        if (this.files.some((f) => f.sha === sha)) return [];
        const id = `file-${this.files.length + 1}`;
        this.files.push({
          id,
          batch_id: params[0] as string | null,
          kind: String(params[1]),
          filename: String(params[2]),
          sha,
          raw_text: String(params[4]),
          summary: JSON.parse(String(params[5])),
        });
        return [{ id }];
      }
      case ACK_BATCH_SQL: {
        const b = this.batch(String(params[0]));
        if (['generated', 'uploaded'].includes(b.status)) b.status = 'accepted';
        b.ack_code = String(params[1]);
        b.file_reference = b.file_reference ?? String(params[2]);
        b.acked_at = new Date();
        return [];
      }
      case NACK_BATCH_SQL: {
        const b = this.batch(String(params[0]));
        if (['generated', 'uploaded', 'accepted'].includes(b.status)) b.status = 'rejected';
        b.nack_summary = String(params[1]);
        b.file_reference = b.file_reference ?? String(params[2]);
        b.nacked_at = new Date();
        return [];
      }
      case SELECT_TX_SQL:
        return this.txs
          .filter((t) => t.batch_id === params[0] && t.customer_reference === params[1])
          .map((t) => ({ id: t.id, payment_id: t.payment_id, status: t.status }));
      case FAIL_TX_SQL: {
        const t = this.txs.find((x) => x.id === params[0])!;
        t.status = 'failed';
        t.equity_error_code = params[1] as string;
        t.equity_error_description = params[2] as string;
        if (params[3]) t.equity_transaction_id = params[3] as string;
        if (params[4]) t.equity_file_reference = params[4] as string;
        return [];
      }
      case COMPLETE_TX_SQL: {
        const t = this.txs.find((x) => x.id === params[0])!;
        t.status = 'completed';
        t.equity_transaction_id = params[1] as string;
        t.equity_file_reference = params[2] as string;
        t.equity_payment_type = params[3] as string;
        t.completed_at = new Date();
        return [];
      }
      case BATCH_TX_COUNTS_SQL: {
        const mine = this.txs.filter((t) => t.batch_id === params[0]);
        return [
          {
            total: mine.length,
            completed: mine.filter((t) => t.status === 'completed').length,
            failed: mine.filter((t) => t.status === 'failed').length,
            open: mine.filter((t) => ['pending', 'processing'].includes(t.status)).length,
          },
        ];
      }
      case PSR_BATCH_SQL: {
        const b = this.batch(String(params[0]));
        if (params[1]) b.status = String(params[1]);
        b.file_reference = b.file_reference ?? (String(params[2]) || null);
        b.psr_received_at = new Date();
        return [];
      }
      default:
        throw new Error(`Unexpected SQL in test: ${text.slice(0, 60)}`);
    }
  };

  transaction: NonNullable<EquityResponseDeps['transaction']> = async (fn) => {
    const snapshot = structuredClone({ batches: this.batches, txs: this.txs, files: this.files });
    try {
      return await fn(this.query);
    } catch (err) {
      this.batches = snapshot.batches;
      this.txs = snapshot.txs;
      this.files = snapshot.files;
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Fake SFTP
// ---------------------------------------------------------------------------

class FakeSftp implements SftpClientLike {
  connectCalls = 0;
  endCalls = 0;
  listCalls: string[] = [];
  getCalls: string[] = [];
  deleteCalls: string[] = [];
  putCalls: string[] = [];
  contents = new Map<string, Buffer>();
  listeners = new Map<string, (...args: any[]) => void>();

  constructor(private readonly connectError?: Error) {}

  add(name: string, content: Buffer | string): this {
    this.contents.set(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
    return this;
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.listeners.set(event, listener);
  }
  async connect(): Promise<void> {
    this.connectCalls++;
    if (this.connectError) throw this.connectError;
  }
  async list(remotePath: string) {
    this.listCalls.push(remotePath);
    return [
      ...[...this.contents].map(([name, buf]) => ({ name, size: buf.length, type: '-' })),
      { name: 'archive', size: 0, type: 'd' },
      { name: 'notes.txt', size: 3, type: '-' },
    ];
  }
  async get(remotePath: string): Promise<Buffer> {
    this.getCalls.push(remotePath);
    const name = remotePath.slice(remotePath.lastIndexOf('/') + 1);
    const buf = this.contents.get(name);
    if (!buf) throw new Error('No such file');
    return buf;
  }
  async put(_input: Buffer, remotePath: string): Promise<void> {
    this.putCalls.push(remotePath);
    throw new Error('the response processor must never upload');
  }
  async stat(): Promise<{ size: number }> {
    throw new Error('not used');
  }
  async delete(remotePath: string): Promise<void> {
    this.deleteCalls.push(remotePath);
    throw new Error('the response processor must never delete');
  }
  async end(): Promise<void> {
    this.endCalls++;
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Harness = {
  db: FakeDb;
  sftp: FakeSftp;
  settled: Array<{ paymentId: string; reference: string }>;
  audits: any[];
  deps: EquityResponseDeps;
  poll: () => ReturnType<typeof runEquityResponsePoll>;
};

function harness(opts: { settleThrowsAt?: number; decrypt?: EquityResponseDeps['decrypt'] } = {}): Harness {
  const db = new FakeDb();
  const sftp = new FakeSftp();
  const settled: Array<{ paymentId: string; reference: string }> = [];
  const audits: any[] = [];
  let settleCalls = 0;
  const deps: EquityResponseDeps = {
    createClient: () => sftp,
    query: db.query,
    transaction: db.transaction,
    env: ENV,
    settle: async (paymentId, reference) => {
      settleCalls++;
      if (opts.settleThrowsAt === settleCalls) throw new Error('settle: database unavailable');
      settled.push({ paymentId, reference });
      return true;
    },
    decrypt: opts.decrypt,
    audit: async (entry) => {
      audits.push(entry);
      return 'audit-id';
    },
  };
  return { db, sftp, settled, audits, deps, poll: () => runEquityResponsePoll({}, deps) };
}

function ok(result: Awaited<ReturnType<typeof runEquityResponsePoll>>) {
  assert.equal(result.status, 'ok');
  return result as Extract<typeof result, { status: 'ok' }>;
}

function ugBatch(h: Harness, status = 'uploaded') {
  h.db.addBatch('b1', UG_BATCH_FILE, status);
  h.db.addTx('b1', UG_REF_1);
  h.db.addTx('b1', UG_REF_2);
}

// ---------------------------------------------------------------------------
// Names and matching
// ---------------------------------------------------------------------------

test('classifyInboundFile: ACK_/NACK_/PSR_ with .csv or .csv.pgp only', () => {
  assert.deepEqual(classifyInboundFile('ACK__x.csv'), { kind: 'ack', encrypted: false });
  assert.deepEqual(classifyInboundFile('NACK__x.csv.pgp'), { kind: 'nack', encrypted: true });
  assert.deepEqual(classifyInboundFile('PSR_x.CSV.PGP'), { kind: 'psr', encrypted: true });
  assert.equal(classifyInboundFile('PSR_x.txt'), null);
  assert.equal(classifyInboundFile('OTHER_x.csv'), null);
  assert.equal(classifyInboundFile('x_PSR_y.csv'), null);
});

test('stemFromResponseFilename: strips prefix, .pgp and .csv', () => {
  assert.equal(stemFromResponseFilename(ACK_NAME), ACK_NAME.replace(/^ACK__/, '').replace(/\.csv$/, ''));
  assert.equal(stemFromResponseFilename('PSR_abc_001.csv.pgp'), 'abc_001');
  assert.equal(stemFromResponseFilename('NACK__abc.csv'), 'abc');
});

test('pickInboundResponseFiles: ignores directories and other files, ACK before NACK before PSR', () => {
  const picked = pickInboundResponseFiles([
    { name: 'PSR_a.csv', size: 1, type: '-' },
    { name: 'ACK__a.csv', size: 1, type: '-' },
    { name: 'NACK__a.csv.pgp', size: 1, type: '-' },
    { name: 'ACK__dir.csv', size: 0, type: 'd' },
    { name: 'readme.txt', size: 1, type: '-' },
  ]);
  assert.deepEqual(picked.map((f) => f.kind), ['ack', 'nack', 'psr']);
});

test('mapPsrStatus: real values Success and Failed; Verification Failure and others are not decisive', () => {
  assert.equal(mapPsrStatus('Success'), 'success');
  assert.equal(mapPsrStatus(' SUCCESS '), 'success');
  assert.equal(mapPsrStatus('Failed'), 'failed');
  assert.equal(mapPsrStatus('failed'), 'failed');
  assert.equal(mapPsrStatus('Verification Failure'), 'verification_failure');
  assert.equal(mapPsrStatus('Pending'), 'unknown');
  assert.equal(mapPsrStatus(''), 'unknown');
});

// ---------------------------------------------------------------------------
// Switch, connection, read-only
// ---------------------------------------------------------------------------

test('disabled unless EQUITY_RESPONSE_POLL_ENABLED is exactly "true": no connection at all', async () => {
  for (const value of [undefined, '', 'TRUE', '1', 'false']) {
    const h = harness();
    const result = await runEquityResponsePoll(
      {},
      { ...h.deps, env: { ...ENV, EQUITY_RESPONSE_POLL_ENABLED: value } }
    );
    assert.deepEqual(result, { status: 'disabled' }, String(value));
    assert.equal(h.sftp.connectCalls, 0);
  }
});

test('one connection attempt; a failure throws without touching the database; password never leaks', async () => {
  const h = harness();
  const failing = new FakeSftp(new Error(`Authentication failed (${PASSWORD})`));
  await assert.rejects(
    () => runEquityResponsePoll({}, { ...h.deps, createClient: () => failing }),
    (err: Error) => {
      assert.match(err.message, /SFTP connection failed/);
      assert.ok(!err.message.includes(PASSWORD));
      return true;
    }
  );
  assert.equal(failing.connectCalls, 1);
  assert.equal(failing.listCalls.length, 0);
  assert.equal(h.db.statements.length, 0);
  assert.equal(h.audits.length, 0);
});

test('missing SFTP configuration stops before connecting', async () => {
  const h = harness();
  await assert.rejects(
    () => runEquityResponsePoll({}, { ...h.deps, env: { EQUITY_RESPONSE_POLL_ENABLED: 'true' } }),
    /Invalid Equity SFTP configuration/
  );
  assert.equal(h.sftp.connectCalls, 0);
});

test('never uploads, deletes or moves anything on the server', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H2085851931618,54307369022,,ACPT,ACPT,File Accepted For Processing\n`);
  h.sftp.add(UG_PSR_NAME, psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]));
  ok(await h.poll());
  assert.equal(h.sftp.deleteCalls.length, 0);
  assert.equal(h.sftp.putCalls.length, 0);
  assert.equal(h.sftp.connectCalls, 1);
  assert.equal(h.sftp.endCalls, 1);
  assert.deepEqual(h.sftp.listCalls, [INBOUND]);
});

// ---------------------------------------------------------------------------
// ACK
// ---------------------------------------------------------------------------

test('ACK (Equity sample) accepts the batch: status, ack_code, file_reference, acked_at', async () => {
  const h = harness();
  h.db.addBatch('b1', OUTBOUND_SAMPLE, 'uploaded');
  h.sftp.add(ACK_NAME, sample(ACK_NAME));

  const r = ok(await h.poll());
  const b = h.db.batch('b1');
  assert.equal(b.status, 'accepted');
  assert.equal(b.ack_code, 'ACPT');
  assert.equal(b.file_reference, 'H2H2085851931618');
  assert.ok(b.acked_at instanceof Date);
  assert.equal(h.db.files.length, 1);
  assert.equal(h.db.files[0].batch_id, 'b1');
  assert.equal(h.db.files[0].kind, 'ack');
  assert.equal(r.filesSeen, 1);
  assert.equal(r.filesNew, 1);
  assert.equal(r.filesProcessed, 1);
  assert.equal(r.unmatched, 0);
});

test('an ACK arriving after the PSR does not move a settled batch back', async () => {
  const h = harness();
  ugBatch(h, 'settled');
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H2085851931618,1,,ACPT,ACPT,File Accepted For Processing\n`);
  ok(await h.poll());
  assert.equal(h.db.batch('b1').status, 'settled');
  assert.equal(h.db.batch('b1').ack_code, 'ACPT');
});

test('an ACK with an unexpected status changes nothing and is flagged for review', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H2085851931618,1,,WAIT,WAIT,Something else\n`);
  const r = ok(await h.poll());
  assert.equal(h.db.batch('b1').status, 'uploaded');
  assert.equal(r.needsReview, 1);
});

// ---------------------------------------------------------------------------
// NACK
// ---------------------------------------------------------------------------

test('NACK (Equity sample) rejects the batch and fails each rejected line by customer reference', async () => {
  const h = harness();
  h.db.addBatch('b1', OUTBOUND_SAMPLE, 'uploaded');
  for (const ref of ['70', '71', '72', '73', '74']) h.db.addTx('b1', ref);
  h.sftp.add(NACK_NAME, sample(NACK_NAME));

  const r = ok(await h.poll());
  const b = h.db.batch('b1');
  assert.equal(b.status, 'rejected');
  assert.equal(b.nack_summary, 'All Records Failed');
  assert.ok(b.nacked_at instanceof Date);
  for (const ref of ['70', '71', '72', '73', '74']) {
    const t = h.db.tx('b1', ref);
    assert.equal(t.status, 'failed', ref);
    assert.equal(t.equity_error_code, 'VERFAL', ref);
    assert.match(String(t.equity_error_description), /Back value dated/, ref);
  }
  assert.match(String(h.db.tx('b1', '71').equity_error_description), /Invalid mobile number/);
  // Reference 72 appears twice in the sample; it is failed once.
  assert.equal(r.failed, 5);
  assert.equal(r.unmatched, 0);
  assert.equal(r.needsReview, 0);
  assert.equal(h.settled.length, 0);
});

test('NACK: a line whose reference is unknown is unmatched; lines it does not mention are flagged', async () => {
  const h = harness();
  h.db.addBatch('b1', OUTBOUND_SAMPLE, 'uploaded');
  h.db.addTx('b1', '70');
  h.db.addTx('b1', 'EXTRA');
  h.sftp.add(NACK_NAME, sample(NACK_NAME));
  const r = ok(await h.poll());
  assert.equal(r.failed, 1);
  assert.equal(r.unmatched, 5); // 71, 72, 73, 74 and the second 72 are not in this batch
  assert.equal(h.db.tx('b1', 'EXTRA').status, 'processing');
  assert.equal(r.needsReview, 1);
});

// ---------------------------------------------------------------------------
// PSR
// ---------------------------------------------------------------------------

test('PSR with one Success row and one Failed row (904): partially_settled, one payment settled', async () => {
  const h = harness();
  ugBatch(h, 'accepted');
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT100', ref: UG_REF_1, status: 'Success', type: 'WALLET', desc: 'Success' },
      { txId: 'BT101', ref: UG_REF_2, status: 'Failed', code: '904', desc: 'Beneficiary wallet not active' },
    ])
  );

  const r = ok(await h.poll());
  const ok1 = h.db.tx('b1', UG_REF_1);
  assert.equal(ok1.status, 'completed');
  assert.equal(ok1.equity_transaction_id, 'BT100');
  assert.equal(ok1.equity_file_reference, 'H2H2085851931618');
  assert.equal(ok1.equity_payment_type, 'WALLET');
  assert.ok(ok1.completed_at instanceof Date);

  const bad = h.db.tx('b1', UG_REF_2);
  assert.equal(bad.status, 'failed');
  assert.equal(bad.equity_error_code, '904');
  assert.equal(bad.equity_error_description, 'Beneficiary wallet not active');
  assert.equal(bad.completed_at, null);

  assert.deepEqual(h.settled, [{ paymentId: ok1.payment_id, reference: 'BT100' }]);
  assert.equal(h.db.batch('b1').status, 'partially_settled');
  assert.ok(h.db.batch('b1').psr_received_at instanceof Date);
  assert.equal(h.db.batch('b1').file_reference, 'H2H2085851931618');
  assert.equal(r.success, 1);
  assert.equal(r.failed, 1);
  assert.equal(r.needsReview, 0);
  assert.equal(r.filesProcessed, 1);
});

test('PSR: all Success settles the batch; all Failed fails it', async () => {
  const good = harness();
  ugBatch(good);
  good.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Success' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Success' },
    ])
  );
  ok(await good.poll());
  assert.equal(good.db.batch('b1').status, 'settled');
  assert.equal(good.settled.length, 2);

  const bad = harness();
  ugBatch(bad);
  bad.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Failed', code: '904', desc: 'x' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Failed', code: '904', desc: 'y' },
    ])
  );
  ok(await bad.poll());
  assert.equal(bad.db.batch('b1').status, 'failed');
  assert.equal(bad.settled.length, 0);
});

test('PSR (Equity sample): successes complete once each, Verification Failure is left for review', async () => {
  const h = harness();
  h.db.addBatch('b1', OUTBOUND_SAMPLE, 'accepted');
  for (const ref of ['70', '71', '72', '73', '74']) h.db.addTx('b1', ref);
  h.sftp.add(PSR_NAME, sample(PSR_NAME));

  const r = ok(await h.poll());
  assert.equal(r.success, 4); // 72 (twice in the file), 74, 71, 73
  assert.equal(h.settled.length, 4);
  assert.equal(h.db.tx('b1', '70').status, 'processing');
  assert.equal(r.needsReview, 1);
  assert.equal(r.failed, 0);
  assert.equal(h.db.batch('b1').status, 'partially_settled');
});

test('the same PSR seen twice settles once (same file name, then same content under a new name)', async () => {
  const h = harness();
  ugBatch(h);
  const content = psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]);
  h.sftp.add(UG_PSR_NAME, content);

  const first = ok(await h.poll());
  assert.equal(first.success, 1);
  assert.equal(h.settled.length, 1);
  assert.equal(h.sftp.getCalls.length, 1);

  // Second poll: already stored by file name, so it is not even downloaded.
  const second = ok(await h.poll());
  assert.equal(second.filesSeen, 1);
  assert.equal(second.filesNew, 0);
  assert.equal(second.success, 0);
  assert.equal(h.sftp.getCalls.length, 1);
  assert.equal(h.settled.length, 1);

  // Same plaintext arriving under a different name: downloaded, recognised by hash, skipped.
  h.sftp.add(`PSR_COPY_${UG_STEM}.csv`, content);
  const third = ok(await h.poll());
  assert.equal(third.filesNew, 1);
  assert.equal(third.duplicates, 1);
  assert.equal(third.filesProcessed, 0);
  assert.equal(third.success, 0);
  assert.equal(h.settled.length, 1);
  assert.equal(h.db.files.length, 1);
});

test('a PSR row with an unknown status leaves the transaction processing and counts as needs review', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      // Error Description says "Success", but Status is not: Status is authoritative.
      { txId: 'BT1', ref: UG_REF_1, status: 'Pending', desc: 'Success' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Verification Failure', code: 'VERFAL', desc: 'Back value dated' },
    ])
  );
  const r = ok(await h.poll());
  assert.equal(h.db.tx('b1', UG_REF_1).status, 'processing');
  assert.equal(h.db.tx('b1', UG_REF_2).status, 'processing');
  assert.equal(r.needsReview, 2);
  assert.equal(r.success, 0);
  assert.equal(r.failed, 0);
  assert.equal(h.settled.length, 0);
  // Nothing decided, so the batch status is unchanged (psr_received_at is recorded).
  assert.equal(h.db.batch('b1').status, 'uploaded');
  assert.ok(h.db.batch('b1').psr_received_at instanceof Date);
});

test('Status decides: Failed with an empty description fails; Success with a description completes', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Success', desc: 'Processed with warning' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Failed', code: '', desc: '' },
    ])
  );
  const r = ok(await h.poll());
  assert.equal(h.db.tx('b1', UG_REF_1).status, 'completed');
  assert.equal(h.db.tx('b1', UG_REF_2).status, 'failed');
  assert.equal(r.success, 1);
  assert.equal(r.failed, 1);
});

test('PSR rows that contradict a final state are flagged, not overwritten', async () => {
  const h = harness();
  h.db.addBatch('b1', UG_BATCH_FILE, 'partially_settled');
  h.db.addTx('b1', UG_REF_1, 'completed');
  h.db.addTx('b1', UG_REF_2, 'failed');
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Failed', code: '904', desc: 'x' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Success' },
    ])
  );
  const r = ok(await h.poll());
  assert.equal(h.db.tx('b1', UG_REF_1).status, 'completed');
  assert.equal(h.db.tx('b1', UG_REF_2).status, 'failed');
  assert.equal(r.needsReview, 2);
  assert.equal(h.settled.length, 0);
});

test('a PSR row for an unknown reference is unmatched', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_PSR_NAME, psrText([{ txId: 'BT9', ref: 'NOPE', status: 'Success' }]));
  const r = ok(await h.poll());
  assert.equal(r.unmatched, 1);
  assert.equal(r.success, 0);
});

test('if settling throws, the whole file is rolled back and retried on the next poll', async () => {
  const h = harness({ settleThrowsAt: 2 });
  ugBatch(h);
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Success' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Success' },
    ])
  );
  const first = ok(await h.poll());
  assert.equal(first.errors, 1);
  assert.equal(first.filesProcessed, 0);
  assert.equal(h.db.files.length, 0, 'not stored, so it will be retried');
  assert.equal(h.db.tx('b1', UG_REF_1).status, 'processing', 'rolled back');
  assert.equal(h.db.batch('b1').status, 'uploaded');
  assert.equal(h.audits[0].success, false);

  const second = ok(await h.poll());
  assert.equal(second.errors, 0);
  assert.equal(second.success, 2);
  assert.equal(h.db.batch('b1').status, 'settled');
  // The first payment was settled in both polls: settle is idempotent by design.
  assert.equal(h.settled.length, 3);
});

// ---------------------------------------------------------------------------
// Unmatched files, .pgp, errors
// ---------------------------------------------------------------------------

test('a file with no matching batch is stored with batch_id null and counted unmatched', async () => {
  const h = harness();
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H1,1,,ACPT,ACPT,File Accepted For Processing\n`);
  h.sftp.add(UG_PSR_NAME, psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]));
  const r = ok(await h.poll());
  assert.equal(h.db.files.length, 2);
  assert.ok(h.db.files.every((f) => f.batch_id === null));
  assert.equal(r.unmatched, 2);
  assert.equal(r.filesProcessed, 2);
  assert.equal(h.settled.length, 0);
});

test('a PSR is matched to its batch by file reference when the name stem does not match', async () => {
  const h = harness();
  const b = h.db.addBatch('b1', 'TMP224_other_name.csv', 'accepted');
  h.db.addTx('b1', UG_REF_1);
  // The PSR rows carry file reference H2H2085851931618 (set earlier by the ACK).
  b.file_reference = 'H2H2085851931618';
  h.sftp.add('PSR_unrelated_stem.csv', psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]));
  const r = ok(await h.poll());
  assert.equal(r.success, 1);
  assert.equal(h.db.files[0].batch_id, 'b1');
});

test('.pgp files are decrypted before hashing, parsing and storing (the stored text is plaintext)', async () => {
  const plaintext = psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]);
  const received: Buffer[] = [];
  const h = harness({
    decrypt: async (input) => {
      received.push(input);
      return Buffer.from(plaintext);
    },
  });
  ugBatch(h);
  h.sftp.add(`${UG_PSR_NAME}.pgp`, '-----BEGIN PGP MESSAGE-----\nciphertext\n-----END PGP MESSAGE-----\n');
  const r = ok(await h.poll());
  assert.equal(received.length, 1);
  assert.equal(r.success, 1);
  assert.equal(h.db.files[0].raw_text, plaintext);
  assert.equal(h.db.files[0].filename, `${UG_PSR_NAME}.pgp`);
});

test('plain .csv files are not sent to the decrypter', async () => {
  const h = harness({
    decrypt: async () => {
      throw new Error('should not be called');
    },
  });
  ugBatch(h);
  h.sftp.add(UG_PSR_NAME, psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]));
  assert.equal(ok(await h.poll()).errors, 0);
});

test('a file that cannot be decrypted or parsed is an error, is not stored and does not stop the others', async () => {
  const h = harness({
    decrypt: async () => {
      throw new Error('Equity response decryption failed: bad key');
    },
  });
  ugBatch(h);
  h.sftp.add(`NACK__${UG_STEM}.csv.pgp`, 'garbage');
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H2085851931618,1,,ACPT,ACPT,File Accepted For Processing\n`);
  h.sftp.add(`PSR_BAD.csv`, 'not,a,psr\n');
  const r = ok(await h.poll());
  assert.equal(r.errors, 2);
  assert.equal(r.filesProcessed, 1);
  assert.equal(h.db.batch('b1').status, 'accepted');
  assert.equal(h.db.files.length, 1);
});

test('files over the size limit are not downloaded', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_PSR_NAME, Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));
  const r = ok(await h.poll());
  assert.equal(r.errors, 1);
  assert.equal(h.sftp.getCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Audit and counts
// ---------------------------------------------------------------------------

test('one audit entry per run that did something, with counts only', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_ACK_NAME, `${UG_STEM},H2H2085851931618,1,,ACPT,ACPT,File Accepted For Processing\n`);
  h.sftp.add(
    UG_PSR_NAME,
    psrText([
      { txId: 'BT1', ref: UG_REF_1, status: 'Success' },
      { txId: 'BT2', ref: UG_REF_2, status: 'Failed', code: '904', desc: 'wallet closed' },
    ])
  );
  const r = ok(await h.poll());
  assert.equal(h.audits.length, 1);
  const a = h.audits[0];
  assert.equal(a.action, 'banking.responses_processed');
  assert.equal(a.category, 'financial');
  assert.equal(a.success, true);
  for (const v of Object.values(a.details)) {
    assert.ok(typeof v === 'number' || typeof v === 'string', 'counts only');
  }
  const text = JSON.stringify([a, r]);
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes('Test Farmer'));
  assert.ok(!text.includes('0751000000'));
  assert.deepEqual(
    Object.keys(r).sort(),
    ['duplicates', 'errors', 'failed', 'filesNew', 'filesProcessed', 'filesSeen', 'needsReview', 'status', 'success', 'unmatched'].sort()
  );

  // Nothing new on the next poll: no second audit entry.
  ok(await h.poll());
  assert.equal(h.audits.length, 1);
});

test('stored parse summaries contain counts, not names or numbers', async () => {
  const h = harness();
  ugBatch(h);
  h.sftp.add(UG_PSR_NAME, psrText([{ txId: 'BT1', ref: UG_REF_1, status: 'Success' }]));
  ok(await h.poll());
  assert.deepEqual(h.db.files[0].summary, { kind: 'psr', records: 1, byStatus: { success: 1 } });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

test('safety: no route or index.ts imports the response service, and nothing schedules it', () => {
  const srcDir = path.resolve(__dirname, '..');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/equityResponseService/.test(entry.name)) {
        if (/equityResponseService/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(srcDir, full));
        }
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});
