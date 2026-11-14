import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { BuiltUgandaBatch } from './equityBatchService';
import {
  connectEquitySftp,
  describeError,
  hostKeyFingerprint,
  hostKeyMatches,
  loadEquitySftpConfig,
  EQUITY_UPLOAD_UNCERTAIN_MESSAGE,
  MARK_BATCH_FAILED_SQL,
  MARK_BATCH_UNCERTAIN_SQL,
  MARK_BATCH_UPLOADED_SQL,
  OperationTimeoutError,
  runEquityBatchCycle,
  runEquityPortalBatchCycle,
  sendBuiltBatches,
  uploadBatchFile,
  type EquitySftpConfig,
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

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type FakeOptions = {
  connectError?: Error;
  /** Called with the key during connect; when it returns false, connect fails like ssh2 does. */
  presentKey?: Buffer;
  putError?: (remotePath: string, call: number) => Error | null;
  /** Remote files after a failed put (e.g. the file made it across anyway). */
  filesAfterFailedPut?: Record<string, number>;
  statError?: Error;
  /** Make the stored size differ from the content. */
  sizeDelta?: number;
  deleteError?: Error;
};

class FakeClient implements SftpClientLike {
  connectCalls = 0;
  endCalls = 0;
  putCalls: Array<{ path: string; bytes: number }> = [];
  deleteCalls: string[] = [];
  listeners = new Map<string, (...args: any[]) => void>();
  files = new Map<string, number>();
  connectOptions: Record<string, any> | null = null;
  private putCount = 0;

  constructor(private readonly opts: FakeOptions = {}) {}

  on(event: string, listener: (...args: any[]) => void): void {
    this.listeners.set(event, listener);
  }

  async connect(options: Record<string, unknown>): Promise<void> {
    this.connectCalls++;
    this.connectOptions = options;
    if (this.opts.presentKey) {
      const verifier = options.hostVerifier as (key: Buffer) => boolean;
      if (!verifier(this.opts.presentKey)) throw new Error('Handshake failed: host denied');
    }
    if (this.opts.connectError) throw this.opts.connectError;
  }

  async put(input: Buffer, remotePath: string): Promise<void> {
    this.putCalls.push({ path: remotePath, bytes: input.length });
    const err = this.opts.putError?.(remotePath, this.putCount++) ?? null;
    if (err) {
      for (const [p, size] of Object.entries(this.opts.filesAfterFailedPut ?? {})) {
        this.files.set(p, size);
      }
      throw err;
    }
    this.files.set(remotePath, input.length + (this.opts.sizeDelta ?? 0));
  }

  async stat(remotePath: string): Promise<{ size: number }> {
    if (this.opts.statError) throw this.opts.statError;
    const size = this.files.get(remotePath);
    if (size === undefined) throw Object.assign(new Error('No such file'), { code: 2 });
    return { size };
  }

  async get(): Promise<Buffer> {
    throw new Error('get is not used by the upload service');
  }

  async delete(remotePath: string): Promise<void> {
    this.deleteCalls.push(remotePath);
    if (this.opts.deleteError) throw this.opts.deleteError;
    this.files.delete(remotePath);
  }

  async list(): Promise<Array<{ name: string; size: number }>> {
    return [];
  }

  async end(): Promise<void> {
    this.endCalls++;
  }
}

type Sql = { text: string; params: unknown[] };

function fakeDb(opts: { failOn?: (sql: Sql, n: number) => Error | null; batchRows?: number } = {}) {
  const calls: Sql[] = [];
  const query: NonNullable<EquitySftpDeps['query']> = async (text, params = []) => {
    const call = { text, params };
    const err = opts.failOn?.(call, calls.length) ?? null;
    calls.push(call);
    if (err) throw err;
    return [{ batch_rows: opts.batchRows ?? 1, tx_rows: 2 }];
  };
  return {
    calls,
    query,
    uploaded: () => calls.filter((c) => c.text === MARK_BATCH_UPLOADED_SQL).map((c) => c.params[0]),
    failed: () =>
      calls
        .filter((c) => c.text === MARK_BATCH_FAILED_SQL)
        .map((c) => ({ id: c.params[0], message: String(c.params[1]) })),
    uncertain: () =>
      calls
        .filter((c) => c.text === MARK_BATCH_UNCERTAIN_SQL)
        .map((c) => ({ id: c.params[0], message: String(c.params[1]) })),
  };
}

function batch(i: number, overrides: Partial<BuiltUgandaBatch> = {}): BuiltUgandaBatch {
  return {
    batchId: `batch-${i}`,
    filename: `FILE${i}.csv.pgp`,
    rowCount: 3,
    totalAmount: 3000,
    encrypted: `-----BEGIN PGP MESSAGE-----\nbody-${i}\n-----END PGP MESSAGE-----\n`,
    ...overrides,
  };
}

function depsWith(client: FakeClient, db: ReturnType<typeof fakeDb>, extra: EquitySftpDeps = {}) {
  return { createClient: () => client, query: db.query, env: ENV, ...extra } satisfies EquitySftpDeps;
}

const OUT = '/upload/OUTBOUND';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('loadEquitySftpConfig: one error lists every missing variable, with no values', () => {
  assert.throws(
    () => loadEquitySftpConfig({}),
    (err: Error) => {
      for (const name of [
        'EQUITY_SFTP_HOST',
        'EQUITY_SFTP_USERNAME',
        'EQUITY_SFTP_PASSWORD',
        'EQUITY_SFTP_HOST_KEY_SHA256',
      ]) {
        assert.ok(err.message.includes(name), name);
      }
      return true;
    }
  );
});

test('loadEquitySftpConfig: only missing ones are listed; host key is required', () => {
  const { EQUITY_SFTP_HOST_KEY_SHA256: _omit, ...withoutKey } = ENV;
  assert.throws(
    () => loadEquitySftpConfig(withoutKey),
    (err: Error) => {
      assert.match(err.message, /EQUITY_SFTP_HOST_KEY_SHA256/);
      assert.doesNotMatch(err.message, /EQUITY_SFTP_HOST\b[^_]/);
      assert.ok(!err.message.includes(PASSWORD));
      return true;
    }
  );
});

test('loadEquitySftpConfig: defaults, normalised directories, validated port and fingerprint', () => {
  const config = loadEquitySftpConfig(ENV);
  assert.equal(config.port, 22);
  assert.equal(config.outboundDir, '/upload/OUTBOUND');
  assert.equal(config.inboundDir, '/upload/INBOUND');
  assert.equal(config.hostKeySha256, FINGERPRINT);

  const custom = loadEquitySftpConfig({
    ...ENV,
    EQUITY_SFTP_PORT: '2222',
    EQUITY_SFTP_OUTBOUND_DIR: 'out/',
    EQUITY_SFTP_INBOUND_DIR: '/in//',
  });
  assert.equal(custom.port, 2222);
  assert.equal(custom.outboundDir, '/out');
  assert.equal(custom.inboundDir, '/in');

  assert.throws(() => loadEquitySftpConfig({ ...ENV, EQUITY_SFTP_PORT: '70000' }), /EQUITY_SFTP_PORT/);
  assert.throws(() => loadEquitySftpConfig({ ...ENV, EQUITY_SFTP_PORT: 'abc' }), /EQUITY_SFTP_PORT/);
  assert.throws(
    () => loadEquitySftpConfig({ ...ENV, EQUITY_SFTP_HOST_KEY_SHA256: 'MD5:abcdef' }),
    /EQUITY_SFTP_HOST_KEY_SHA256/
  );
});

test('loadEquitySftpConfig: the password is usable but never shows when the config is printed', () => {
  const config = loadEquitySftpConfig(ENV);
  assert.equal(config.password, PASSWORD);
  assert.ok(!JSON.stringify(config).includes(PASSWORD));
  assert.ok(!Object.keys(config).includes('password'));
});

test('describeError: removes the password and bounds the length', () => {
  const text = describeError(new Error(`login failed for ${PASSWORD} and ${PASSWORD}`), PASSWORD);
  assert.ok(!text.includes(PASSWORD));
  assert.match(text, /\[redacted\]/);
  assert.ok(describeError(new Error('x'.repeat(5000))).length <= 501);
});

// ---------------------------------------------------------------------------
// Host key and connect
// ---------------------------------------------------------------------------

test('hostKeyFingerprint: OpenSSH SHA256 format (unpadded base64)', () => {
  assert.equal(hostKeyFingerprint(HOST_KEY), FINGERPRINT);
  assert.ok(!FINGERPRINT.endsWith('='));
  assert.equal(hostKeyMatches(HOST_KEY, FINGERPRINT), true);
  assert.equal(hostKeyMatches(Buffer.from('another key'), FINGERPRINT), false);
});

test('connectEquitySftp: password auth, keyboard-interactive answered, timeout set, one attempt', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const config = loadEquitySftpConfig(ENV);
  const connected = await connectEquitySftp(config, { createClient: () => client });

  assert.equal(connected, client);
  assert.equal(client.connectCalls, 1);
  const o = client.connectOptions!;
  assert.equal(o.host, 'sftp.example.test');
  assert.equal(o.port, 22);
  assert.equal(o.username, 'drapius');
  assert.equal(o.password, PASSWORD);
  assert.equal(o.tryKeyboard, true);
  assert.ok(o.readyTimeout > 0 && o.readyTimeout <= 60_000);
  assert.equal(typeof o.hostVerifier, 'function');
  assert.equal(o.retries, undefined);

  let answers: string[] = [];
  client.listeners.get('keyboard-interactive')!('n', 'i', 'en', [{}, {}], (a: string[]) => {
    answers = a;
  });
  assert.deepEqual(answers, [PASSWORD, PASSWORD]);
});

test('connectEquitySftp: a host key mismatch refuses the connection with a clear error', async () => {
  const client = new FakeClient({ presentKey: Buffer.from('evil server key') });
  await assert.rejects(
    () => connectEquitySftp(loadEquitySftpConfig(ENV), { createClient: () => client }),
    (err: Error) => {
      assert.match(err.message, /host key verification failed/);
      assert.match(err.message, /does not match EQUITY_SFTP_HOST_KEY_SHA256/);
      assert.ok(!err.message.includes(PASSWORD));
      return true;
    }
  );
  assert.equal(client.connectCalls, 1);
  assert.equal(client.endCalls, 1);
});

test('connectEquitySftp: a login failure is one attempt, closed, and does not leak the password', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    connectError: new Error(`All configured authentication methods failed (${PASSWORD})`),
  });
  await assert.rejects(
    () => connectEquitySftp(loadEquitySftpConfig(ENV), { createClient: () => client }),
    (err: Error) => {
      assert.match(err.message, /^SFTP connection failed:/);
      assert.ok(!err.message.includes(PASSWORD));
      return true;
    }
  );
  assert.equal(client.connectCalls, 1);
  assert.equal(client.endCalls, 1);
});

// ---------------------------------------------------------------------------
// uploadBatchFile
// ---------------------------------------------------------------------------

test('uploadBatchFile: uploads under the final name, then checks the remote size', async () => {
  const client = new FakeClient();
  await uploadBatchFile(client, { filename: 'A.csv.pgp', content: 'héllo' }, OUT);
  assert.deepEqual(client.putCalls, [{ path: `${OUT}/A.csv.pgp`, bytes: Buffer.byteLength('héllo') }]);
});

test('uploadBatchFile: a size mismatch is an error', async () => {
  const client = new FakeClient({ sizeDelta: -1 });
  await assert.rejects(
    () => uploadBatchFile(client, { filename: 'A.csv.pgp', content: 'abcdef' }, OUT),
    /size mismatch/
  );
});

test('uploadBatchFile: refuses file names that could leave the directory', async () => {
  const client = new FakeClient();
  for (const filename of ['', '../x', 'a/b', '..', 'a\\b']) {
    await assert.rejects(() => uploadBatchFile(client, { filename, content: 'x' }, OUT), /Invalid batch file name/);
  }
  assert.equal(client.putCalls.length, 0);
});

// ---------------------------------------------------------------------------
// sendBuiltBatches
// ---------------------------------------------------------------------------

test('sendBuiltBatches: uploads files one after another over one connection and records each', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2), batch(3)], depsWith(client, db));

  assert.equal(client.connectCalls, 1);
  assert.equal(client.endCalls, 1);
  assert.deepEqual(client.putCalls.map((p) => p.path), [
    `${OUT}/FILE1.csv.pgp`,
    `${OUT}/FILE2.csv.pgp`,
    `${OUT}/FILE3.csv.pgp`,
  ]);
  assert.deepEqual(db.uploaded(), ['batch-1', 'batch-2', 'batch-3']);
  assert.equal(db.failed().length, 0);
  assert.equal(out.uploaded, 3);
  assert.equal(out.failed, 0);
  assert.equal(out.unrecorded, 0);
  assert.equal(out.uploadedRows, 9);
});

test('uploaded SQL: batch uploaded with uploaded_at NOW(), its pending transactions processing', () => {
  const sql = MARK_BATCH_UPLOADED_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /UPDATE equity_payment_batches SET status = 'uploaded', uploaded_at = NOW\(\)/);
  assert.match(sql, /WHERE id = \$1 AND status = 'generated'/);
  assert.match(sql, /UPDATE bank_transactions SET status = 'processing' WHERE batch_id = \$1 AND status::text = 'pending'/);
});

test('failed SQL: batch failed with error_message, transactions failed with UPLOAD_FAILED', () => {
  const sql = MARK_BATCH_FAILED_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /UPDATE equity_payment_batches SET status = 'failed', error_message = \$2/);
  assert.match(sql, /UPDATE bank_transactions SET status = 'failed', equity_error_code = 'UPLOAD_FAILED' WHERE batch_id = \$1 AND status::text = 'pending'/);
});

test('sendBuiltBatches: after an upload error the remote file is checked; right size = success', async () => {
  const content = batch(1).encrypted!;
  const client = new FakeClient({
    presentKey: HOST_KEY,
    putError: () => new Error('channel closed after write'),
    filesAfterFailedPut: { [`${OUT}/FILE1.csv.pgp`]: Buffer.byteLength(content) },
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db));

  assert.deepEqual(db.uploaded(), ['batch-1']);
  assert.equal(db.failed().length, 0);
  assert.equal(out.uploaded, 1);
  assert.equal(out.failed, 0);
});

test('sendBuiltBatches: upload error with no (or a wrong-size) remote file marks the batch failed', async () => {
  const content = batch(2).encrypted!;
  const client = new FakeClient({
    presentKey: HOST_KEY,
    putError: (remotePath) => (remotePath.endsWith('FILE1.csv.pgp') ? new Error('write failed') : null),
    // For FILE1 nothing arrives; the later file uploads normally.
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));

  assert.deepEqual(db.uploaded(), ['batch-2']);
  assert.equal(db.failed().length, 1);
  assert.equal(db.failed()[0].id, 'batch-1');
  assert.match(db.failed()[0].message, /Upload failed: write failed/);
  assert.equal(out.uploaded, 1);
  assert.equal(out.failed, 1);
  assert.equal(out.failedRows, 3);
  assert.ok(content.length > 0);

  const partial = new FakeClient({
    presentKey: HOST_KEY,
    putError: () => new Error('broken pipe'),
    filesAfterFailedPut: { [`${OUT}/FILE1.csv.pgp`]: 5 },
  });
  const db2 = fakeDb();
  await sendBuiltBatches([batch(1)], depsWith(partial, db2));
  assert.equal(db2.uploaded().length, 0);
  assert.equal(db2.failed().length, 1);
  assert.deepEqual(partial.deleteCalls, [`${OUT}/FILE1.csv.pgp`]);
});

test('sendBuiltBatches: connection or login failure marks every batch failed; nothing stays generated', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    connectError: new Error(`Authentication failed for ${PASSWORD}`),
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));

  assert.equal(client.connectCalls, 1);
  assert.equal(client.putCalls.length, 0);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-1', 'batch-2']);
  assert.equal(db.uploaded().length, 0);
  assert.equal(out.failed, 2);
  for (const f of db.failed()) {
    assert.match(f.message, /SFTP connection failed/);
    assert.ok(!f.message.includes(PASSWORD));
  }
  assert.ok(!JSON.stringify(out).includes(PASSWORD));
});

test('sendBuiltBatches: a host key mismatch fails every batch and sends nothing', async () => {
  const client = new FakeClient({ presentKey: Buffer.from('someone else') });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));
  assert.equal(client.putCalls.length, 0);
  assert.equal(out.failed, 2);
  assert.match(db.failed()[0].message, /host key verification failed/);
});

test('sendBuiltBatches: missing configuration fails every batch without connecting', async () => {
  const client = new FakeClient();
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db, { env: {} }));
  assert.equal(client.connectCalls, 0);
  assert.equal(out.failed, 1);
  assert.match(db.failed()[0].message, /Invalid Equity SFTP configuration/);
});

/** Client whose connection dies when a given put fails: later stat calls throw. */
function clientThatDiesOnPut(failingCall: number): FakeClient {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    putError: (_p, call) => (call === failingCall ? new Error('connection reset') : null),
  });
  const origStat = client.stat.bind(client);
  const origPut = client.put.bind(client);
  let broken = false;
  client.put = async (input: Buffer, p: string) => {
    try {
      return await origPut(input, p);
    } catch (e) {
      broken = true;
      throw e;
    }
  };
  client.stat = async (p: string) => {
    if (broken) throw new Error('Not connected');
    return origStat(p);
  };
  return client;
}

test('uncertain: upload error and the remote file cannot be checked => hold the payments and stop', async () => {
  const client = clientThatDiesOnPut(1);
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2), batch(3)], depsWith(client, db));

  // Batch 1 went fine.
  assert.deepEqual(db.uploaded(), ['batch-1']);
  // Batch 2 is uncertain: NOT failed (payments not released), only error_message is set.
  assert.deepEqual(db.uncertain(), [{ id: 'batch-2', message: EQUITY_UPLOAD_UNCERTAIN_MESSAGE }]);
  assert.equal(
    EQUITY_UPLOAD_UNCERTAIN_MESSAGE,
    'UPLOAD_UNCERTAIN: check the Equity outbound and inbound folders before retrying'
  );
  assert.ok(!db.failed().some((f) => f.id === 'batch-2'));
  assert.equal(out.results[1].status, 'uncertain');
  assert.equal(out.results[1].recorded, true);
  // The uncertain statement must not change status or touch bank_transactions.
  const sql = MARK_BATCH_UNCERTAIN_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /^UPDATE equity_payment_batches SET error_message = \$2, updated_at = NOW\(\) WHERE id = \$1 AND status = 'generated'$/);
  assert.doesNotMatch(sql, /status = '(failed|uploaded)'|bank_transactions/);
  // The run stopped: batch 3 was never attempted.
  assert.equal(client.putCalls.length, 2);
  assert.equal(client.deleteCalls.length, 0);
  assert.equal(out.uploaded, 1);
  assert.equal(out.uncertain, 1);
  assert.equal(out.failed, 1);
  assert.equal(client.endCalls, 1);
});

test('never attempted: batches after a stop are released as failed, not left generated', async () => {
  const client = clientThatDiesOnPut(0);
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2), batch(3)], depsWith(client, db));

  assert.deepEqual(db.uncertain().map((u) => u.id), ['batch-1']);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-2', 'batch-3']);
  for (const f of db.failed()) assert.match(f.message, /^Not uploaded: /);
  assert.deepEqual(out.results.map((r) => r.status), ['uncertain', 'failed', 'failed']);
  assert.equal(out.results[1].recorded, true);
  assert.equal(client.putCalls.length, 1, 'only the first file was ever attempted');
  assert.equal(out.uncertain, 1);
  assert.equal(out.failed, 2);
});

test('an invalid file name is a certain failure (nothing was sent) and does not stop the run', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb();
  const out = await sendBuiltBatches(
    [batch(1, { filename: '../escape.pgp' }), batch(2)],
    depsWith(client, db)
  );
  assert.deepEqual(out.results.map((r) => r.status), ['failed', 'uploaded']);
  assert.equal(client.putCalls.length, 1);
});

test('uncertain: an upload that times out may still land, so it is held, not released', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    putError: () => new OperationTimeoutError('upload', 60_000),
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));
  assert.deepEqual(db.uncertain().map((u) => u.id), ['batch-1']);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-2']);
  assert.equal(out.uncertain, 1);
  assert.equal(client.putCalls.length, 1);
});

test('uncertain: if even recording it fails the batch is still not released', async () => {
  const client = clientThatDiesOnPut(0);
  const db = fakeDb({
    failOn: (sql) => (sql.text === MARK_BATCH_UNCERTAIN_SQL ? new Error('db down') : null),
  });
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db));
  assert.equal(out.results[0].status, 'uncertain');
  assert.equal(out.results[0].recorded, false);
  assert.equal(db.failed().length, 0);
});

test('certain failure: upload error and the stat check says the file is absent => released', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY, putError: () => new Error('disk full') });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db));
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-1']);
  assert.equal(db.uncertain().length, 0);
  assert.equal(out.results[0].status, 'failed');
  assert.equal(client.deleteCalls.length, 0, 'nothing to delete when the file is absent');
});

test('partial file: wrong size => best-effort delete, batch still failed', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    putError: () => new Error('connection closed mid-write'),
    filesAfterFailedPut: { [`${OUT}/FILE1.csv.pgp`]: 10 },
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db));

  assert.deepEqual(client.deleteCalls, [`${OUT}/FILE1.csv.pgp`]);
  assert.equal(client.files.has(`${OUT}/FILE1.csv.pgp`), false);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-1']);
  assert.match(db.failed()[0].message, /remote file has 10 bytes/);
  assert.match(db.failed()[0].message, /partial remote file was deleted/);
  assert.equal(db.uploaded().length, 0);
  assert.equal(out.failed, 1);
});

test('partial file: a size mismatch after a normal put is deleted too', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY, sizeDelta: -3 });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1)], depsWith(client, db));
  assert.equal(client.deleteCalls.length, 1);
  assert.equal(out.failed, 1);
  assert.match(db.failed()[0].message, /size mismatch/);
});

test('partial file: if the delete fails too, that is recorded in error_message and it is still failed', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    sizeDelta: 4,
    deleteError: new Error(`permission denied ${PASSWORD}`),
  });
  const db = fakeDb();
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));

  assert.equal(client.deleteCalls.length, 2); // each wrong-size file gets its own attempt
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-1', 'batch-2']);
  assert.match(db.failed()[0].message, /deleting the partial remote file also failed: permission denied/);
  assert.ok(!db.failed()[0].message.includes(PASSWORD));
  assert.equal(db.uncertain().length, 0);
  assert.equal(out.failed, 2);
});

test('sendBuiltBatches: an uploaded file whose database update fails is NOT marked failed', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb({
    failOn: (sql) => (sql.text === MARK_BATCH_UPLOADED_SQL ? new Error('db down') : null),
  });
  const out = await sendBuiltBatches([batch(1), batch(2)], depsWith(client, db));

  const first = out.results[0];
  assert.equal(first.status, 'uploaded');
  assert.equal(first.recorded, false);
  assert.ok(!db.failed().some((f) => f.id === 'batch-1'), 'must not be reselectable: it was sent');
  // The run stopped; the unsent one is failed so it can be selected again.
  assert.equal(client.putCalls.length, 1);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-2']);
  assert.equal(out.unrecorded, 1);
});

test('sendBuiltBatches: batches without an id or content are failed, not uploaded', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb();
  const out = await sendBuiltBatches(
    [batch(1, { encrypted: undefined }), batch(2, { batchId: null })],
    depsWith(client, db)
  );
  assert.equal(client.putCalls.length, 0);
  assert.equal(out.failed, 2);
  assert.deepEqual(db.failed().map((f) => f.id), ['batch-1']);
  assert.equal(out.unrecorded, 1);
});

test('sendBuiltBatches: nothing to send means no connection', async () => {
  const client = new FakeClient();
  const out = await sendBuiltBatches([], depsWith(client, fakeDb()));
  assert.equal(client.connectCalls, 0);
  assert.equal(out.results.length, 0);
});

// ---------------------------------------------------------------------------
// runEquityBatchCycle
// ---------------------------------------------------------------------------

const BUILT_OK = {
  status: 'ok' as const,
  dryRun: false,
  candidateCount: 9,
  batches: [batch(1), batch(2, { rowCount: 5, totalAmount: 7000 })],
  totalAmount: 10_000,
  skippedCount: 2,
  skippedByReason: {},
  deferredCount: 4,
};

test('runEquityBatchCycle: refused unless BOTH switches are exactly "true"', async () => {
  const values = [undefined, '', 'TRUE', '1', 'yes', 'false'];
  const cases: NodeJS.ProcessEnv[] = [];
  // Task-payments switch not exactly 'true' (auto-send on, and even when it is on).
  for (const v of values) cases.push({ ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: v });
  // Auto-send switch not exactly 'true' (task-payments on).
  for (const v of values) cases.push({ ...ENV, EQUITY_AUTO_SEND_ENABLED: v, EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' });
  for (const env of cases) {
    let built = 0;
    let created = 0;
    const result = await runEquityBatchCycle(
      { dryRun: false },
      {
        env,
        build: async () => {
          built++;
          return BUILT_OK;
        },
        createClient: () => {
          created++;
          return new FakeClient();
        },
      }
    );
    assert.deepEqual(result, { status: 'disabled' }, JSON.stringify(env));
    assert.equal(built, 0);
    assert.equal(created, 0);
  }
});

test('runEquityBatchCycle: a dry run is allowed while disabled and never connects', async () => {
  let created = 0;
  let seenDryRun: boolean | undefined;
  const result = await runEquityBatchCycle(
    { dryRun: true, initiatedBy: 'user-1' },
    {
      env: { EQUITY_AUTO_SEND_ENABLED: 'false' }, // not even SFTP config
      build: async (p) => {
        seenDryRun = p.dryRun;
        return { ...BUILT_OK, dryRun: true, batches: BUILT_OK.batches.map((b) => ({ ...b, batchId: null, encrypted: undefined })) };
      },
      createClient: () => {
        created++;
        return new FakeClient();
      },
      query: async () => {
        throw new Error('dry run must not touch the database here');
      },
      audit: async () => {
        throw new Error('dry run must not write an audit entry');
      },
    }
  );
  assert.equal(seenDryRun, true);
  assert.equal(created, 0);
  assert.equal(result.status, 'dry_run');
  assert.deepEqual(result, {
    status: 'dry_run',
    batches: 2,
    rows: 8,
    totalAmount: 10_000,
    uploaded: 0,
    failed: 0,
    uncertain: 0,
    skipped: 2,
    deferred: 4,
  });
});

test('runEquityBatchCycle: builds, sends, returns counts only and writes one audit entry', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb();
  const audits: any[] = [];
  const result = await runEquityBatchCycle(
    { dryRun: false, initiatedBy: 'user-1' },
    {
      env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
      build: async () => BUILT_OK,
      createClient: () => client,
      query: db.query,
      audit: async (entry) => {
        audits.push(entry);
        return 'audit-id';
      },
    }
  );

  assert.deepEqual(result, {
    status: 'ok',
    unrecorded: 0,
    batches: 2,
    rows: 8,
    totalAmount: 10_000,
    uploaded: 2,
    failed: 0,
    uncertain: 0,
    skipped: 2,
    deferred: 4,
  });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'banking.batch_sent');
  assert.equal(audits[0].category, 'financial');
  assert.equal(audits[0].userId, 'user-1');
  assert.equal(audits[0].success, true);
  const text = JSON.stringify(audits[0]);
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes('PGP MESSAGE'));
  for (const v of Object.values(audits[0].details)) {
    assert.ok(typeof v === 'number' || typeof v === 'string', 'counts only');
  }
});

test('runEquityBatchCycle: failed uploads are counted, audited as unsuccessful, and password-free', async () => {
  const client = new FakeClient({
    presentKey: HOST_KEY,
    connectError: new Error(`bad login ${PASSWORD}`),
  });
  const db = fakeDb();
  const audits: any[] = [];
  const result = await runEquityBatchCycle(
    { dryRun: false },
    {
      env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
      build: async () => BUILT_OK,
      createClient: () => client,
      query: db.query,
      audit: async (entry) => {
        audits.push(entry);
        return 'id';
      },
    }
  );
  assert.equal(result.status, 'ok');
  assert.equal((result as { uploaded: number }).uploaded, 0);
  assert.equal((result as { failed: number }).failed, 2);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].success, false);
  assert.ok(!JSON.stringify([result, audits]).includes(PASSWORD));
});

test('runEquityBatchCycle: uncertain batches are counted in the summary and the audit entry', async () => {
  const client = clientThatDiesOnPut(1);
  const db = fakeDb();
  const audits: any[] = [];
  const result = await runEquityBatchCycle(
    { dryRun: false },
    {
      env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
      build: async () => ({ ...BUILT_OK, batches: [batch(1), batch(2), batch(3)] }),
      createClient: () => client,
      query: db.query,
      audit: async (entry) => {
        audits.push(entry);
        return 'id';
      },
    }
  );
  const r = result as { uploaded: number; failed: number; uncertain: number };
  assert.equal(r.uploaded, 1);
  assert.equal(r.uncertain, 1);
  assert.equal(r.failed, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].details.uncertain, 1);
  assert.equal(audits[0].details.uploaded, 1);
  assert.equal(audits[0].details.failed, 1);
  assert.equal(audits[0].success, false);
});

test('runEquityBatchCycle: no batches means no connection and no audit entry', async () => {
  let created = 0;
  let audited = 0;
  const result = await runEquityBatchCycle(
    { dryRun: false },
    {
      env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
      build: async () => ({ ...BUILT_OK, batches: [], totalAmount: 0, skippedCount: 0, deferredCount: 0 }),
      createClient: () => {
        created++;
        return new FakeClient();
      },
      query: fakeDb().query,
      audit: async () => {
        audited++;
        return 'id';
      },
    }
  );
  assert.equal(created, 0);
  assert.equal(audited, 0);
  assert.equal((result as { batches: number }).batches, 0);
});

test('runEquityBatchCycle: missing SFTP configuration stops before any batch is built', async () => {
  let built = 0;
  await assert.rejects(
    () =>
      runEquityBatchCycle(
        { dryRun: false },
        {
          env: { EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
          build: async () => {
            built++;
            return BUILT_OK;
          },
        }
      ),
    /Invalid Equity SFTP configuration/
  );
  assert.equal(built, 0);
});

test('runEquityBatchCycle: passes a locked build through without sending', async () => {
  const result = await runEquityBatchCycle(
    { dryRun: false },
    {
      env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true', EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true' },
      build: async () => ({ status: 'locked' as const }),
    }
  );
  assert.deepEqual(result, { status: 'locked' });
});

// ---------------------------------------------------------------------------
// runEquityPortalBatchCycle
// ---------------------------------------------------------------------------

const PORTAL_ENV = { ...ENV, EQUITY_AUTO_SEND_ENABLED: 'true' };

test('runEquityPortalBatchCycle: refused unless EQUITY_AUTO_SEND_ENABLED is exactly "true" (the old-route switch is irrelevant)', async () => {
  for (const value of [undefined, '', 'TRUE', '1', 'yes', 'false']) {
    for (const taskSwitch of [undefined, 'true']) {
      let built = 0;
      let created = 0;
      const result = await runEquityPortalBatchCycle(
        { dryRun: false },
        {
          env: { ...ENV, EQUITY_AUTO_SEND_ENABLED: value, EQUITY_TASK_PAYMENTS_SEND_ENABLED: taskSwitch },
          buildPortal: async () => {
            built++;
            return BUILT_OK;
          },
          createClient: () => {
            created++;
            return new FakeClient();
          },
        }
      );
      assert.deepEqual(result, { status: 'disabled' }, String(value));
      assert.equal(built, 0);
      assert.equal(created, 0);
    }
  }
});

test('runEquityPortalBatchCycle: runs with only EQUITY_AUTO_SEND_ENABLED, uses the portal builder, sends and audits counts', async () => {
  const client = new FakeClient({ presentKey: HOST_KEY });
  const db = fakeDb();
  const audits: any[] = [];
  let portalBuilds = 0;
  let oldBuilds = 0;
  const result = await runEquityPortalBatchCycle(
    { dryRun: false, initiatedBy: 'scheduler' },
    {
      env: PORTAL_ENV,
      buildPortal: async (p) => {
        portalBuilds++;
        assert.equal(p.dryRun, false);
        assert.equal(p.initiatedBy, 'scheduler');
        return BUILT_OK;
      },
      build: async () => {
        oldBuilds++;
        return BUILT_OK;
      },
      createClient: () => client,
      query: db.query,
      audit: async (entry) => {
        audits.push(entry);
        return 'audit-id';
      },
    }
  );
  assert.equal(portalBuilds, 1);
  assert.equal(oldBuilds, 0);
  assert.deepEqual(result, {
    status: 'ok',
    unrecorded: 0,
    batches: 2,
    rows: 8,
    totalAmount: 10_000,
    uploaded: 2,
    failed: 0,
    uncertain: 0,
    skipped: 2,
    deferred: 4,
  });
  assert.equal(client.connectCalls, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'banking.batch_sent');
  assert.equal(audits[0].success, true);
  assert.ok(!JSON.stringify(audits[0]).includes(PASSWORD));
  for (const v of Object.values(audits[0].details)) {
    assert.ok(typeof v === 'number' || typeof v === 'string', 'counts only');
  }
});

test('runEquityPortalBatchCycle: no eligible lines means no SFTP connection, no client and no audit entry', async () => {
  let created = 0;
  let audited = 0;
  const client = new FakeClient();
  const result = await runEquityPortalBatchCycle(
    { dryRun: false },
    {
      env: PORTAL_ENV,
      buildPortal: async () => ({
        ...BUILT_OK,
        candidateCount: 0,
        batches: [],
        totalAmount: 0,
        skippedCount: 0,
        deferredCount: 0,
      }),
      createClient: () => {
        created++;
        return client;
      },
      query: async () => {
        throw new Error('nothing to record: the database must not be touched');
      },
      audit: async () => {
        audited++;
        return 'id';
      },
    }
  );
  assert.equal(created, 0);
  assert.equal(client.connectCalls, 0);
  assert.equal(audited, 0);
  assert.equal(result.status, 'ok');
  assert.equal((result as { batches: number }).batches, 0);
  assert.equal((result as { uploaded: number }).uploaded, 0);
});

test('runEquityPortalBatchCycle: missing SFTP configuration stops before any batch is built', async () => {
  let built = 0;
  await assert.rejects(
    () =>
      runEquityPortalBatchCycle(
        { dryRun: false },
        {
          env: { EQUITY_AUTO_SEND_ENABLED: 'true' },
          buildPortal: async () => {
            built++;
            return BUILT_OK;
          },
        }
      ),
    /Invalid Equity SFTP configuration/
  );
  assert.equal(built, 0);
});

test('runEquityPortalBatchCycle: passes a locked build through without sending', async () => {
  let created = 0;
  const result = await runEquityPortalBatchCycle(
    { dryRun: false },
    {
      env: PORTAL_ENV,
      buildPortal: async () => ({ status: 'locked' as const }),
      createClient: () => {
        created++;
        return new FakeClient();
      },
    }
  );
  assert.deepEqual(result, { status: 'locked' });
  assert.equal(created, 0);
});

test('runEquityPortalBatchCycle: a dry run is allowed while disabled and never connects', async () => {
  let created = 0;
  const result = await runEquityPortalBatchCycle(
    { dryRun: true },
    {
      env: { EQUITY_AUTO_SEND_ENABLED: 'false' },
      buildPortal: async (p) => {
        assert.equal(p.dryRun, true);
        return { ...BUILT_OK, dryRun: true };
      },
      createClient: () => {
        created++;
        return new FakeClient();
      },
    }
  );
  assert.equal(created, 0);
  assert.equal(result.status, 'dry_run');
});

// ---------------------------------------------------------------------------
// Safety rules
// ---------------------------------------------------------------------------

test('safety: only the equity services and the equity scheduler import the SFTP service (no route, no index.ts)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const srcDir = path.resolve(__dirname, '..');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/^equity(Sftp|Response)Service|^equityScheduler/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (/equitySftpService/.test(text)) offenders.push(path.relative(srcDir, full));
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});

// Keep the config type exported for scripts and reviewers.
const _typecheck: EquitySftpConfig | null = null;
void _typecheck;
