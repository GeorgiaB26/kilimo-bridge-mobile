/**
 * Tests for the one-off Equity UAT amount-0 negative test (equityZeroAmountUat.ts, the
 * `zeroAmountOverride` seam in equityBatchService.ts, scripts/send-equity-zero-amount-uat.ts).
 *
 * Real SQL against PGlite (migrations 018 + 020, portal fixture tables, SQL stand-ins for the
 * portal functions), with pg's Pool pointed at it. SFTP is always a fake: no test can connect to
 * a real server. The file is named equityResponseService.* because it applies a NACK through the
 * real response poll, and the repo's safety scans only allow that name to import the poll.
 *
 * Run one file per process:  npx tsx --test src/services/equityResponseService.zeroAmountUat.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import * as openpgp from 'openpgp';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  parseZeroAmountUatArgs,
  runZeroAmountUat,
  type ZeroAmountUatDeps,
} from '../../scripts/send-equity-zero-amount-uat';
import {
  buildUgandaPortalBatches,
  planUgandaBatches,
  rebuildBatchFile,
  type UgandaPaymentCandidate,
} from './equityBatchService';
import { createPortalTestDb, resetPortalTestDb } from './equityPortalTestDb';
import { runEquityResponsePoll, type EquityResponseDeps, type QueryFn } from './equityResponseService';
import {
  runEquityBatchCycle,
  runEquityPortalBatchCycle,
  type SftpClientLike,
} from './equitySftpService';
import {
  EQUITY_UAT_SFTP_HOST,
  ZeroAmountUatRefusal,
  type QueryRows,
} from './equityZeroAmountUat';

const PROD_HOST = '196.216.242.209';
const PASSWORD = 'S3cret-pass/word';
const DEBIT_ACCOUNT = '1003200930075';
const WALLET = '0751000000';
const BANK_REF = 'PB-UG-UGX-20261123-001-001';
const NACK_REASON = 'Amount should be greater than zero';

let db: PGlite;
let tmpDir: string;
let executed: string[] = [];
let connects = 0;
const originalConnect = Pool.prototype.connect;
const originalQuery = Pool.prototype.query;
const savedEnv = { ...process.env };

before(async () => {
  db = await createPortalTestDb();

  (Pool.prototype as unknown as { connect: unknown }).connect = async function () {
    connects++;
    return {
      query: async (text: string, params?: unknown[]) => {
        executed.push(text);
        return db.query(text, params);
      },
      release: () => undefined,
    };
  };
  (Pool.prototype as unknown as { query: unknown }).query = async function (text: string, params?: unknown[]) {
    executed.push(text);
    return db.query(text, params);
  };

  const { publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519Legacy',
    userIDs: [{ name: 'Equity Test', email: 'equity@example.test' }],
    format: 'armored',
  });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'equity-zero-uat-test-'));
  const keyPath = path.join(tmpDir, 'equity-public.asc');
  fs.writeFileSync(keyPath, publicKey);
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
  await resetPortalTestDb(db);
  executed = [];
  connects = 0;
  // A clean, UAT-looking environment for every test. Tests change single variables from here.
  process.env.DATABASE_URL = 'postgres://stub:stub@127.0.0.1:1/stub';
  process.env.EQUITY_SFTP_CUSTOMER_ID = '56010646936';
  process.env.EQUITY_UG_DEBIT_ACCOUNT = DEBIT_ACCOUNT;
  process.env.EQUITY_AUTO_SEND_MAX_TOTAL = '1000000000000';
  process.env.EQUITY_SFTP_HOST = EQUITY_UAT_SFTP_HOST;
  process.env.EQUITY_SFTP_USERNAME = 'drapius';
  process.env.EQUITY_SFTP_PASSWORD = PASSWORD;
  process.env.EQUITY_SFTP_HOST_KEY_SHA256 = `SHA256:${'A'.repeat(43)}`;
  delete process.env.ZERO_AMOUNT_UAT_LINE_ID;
  delete process.env.EQUITY_AUTO_SEND_ENABLED;
  delete process.env.EQUITY_RESPONSE_POLL_ENABLED;
  delete process.env.EQUITY_AUTO_SEND_MAX_PAYMENTS;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Seeded = { lineId: string; farmerId: string; batchId: string; otherLineId: string };

/**
 * A released portal batch with the UAT line (Akera-style: wallet 0751000000, portal amount 10000)
 * and, optionally, a second released line that must never be built.
 */
async function seedUat(
  opts: {
    stage?: string;
    released?: boolean;
    phone?: string | null;
    name?: string;
    bankReference?: string | null;
    holdKind?: string | null;
    setToken?: boolean;
  } = {}
): Promise<Seeded> {
  const batchId = uuidv4();
  await db.query(
    `INSERT INTO payment_batches (id, batch_ref, status, country, currency, released_at)
     VALUES ($1, 'PB-UG-UGX-20261123-001', 'approved', 'Uganda', 'UGX', $2)`,
    [batchId, opts.released === false ? null : new Date()]
  );
  const farmerId = uuidv4();
  await db.query(`INSERT INTO farmers (farmer_id, name, phone_number, country) VALUES ($1, $2, $3, 'Uganda')`, [
    farmerId,
    opts.name ?? 'Akera Test',
    opts.phone === undefined ? WALLET : opts.phone,
  ]);
  const lineId = uuidv4();
  await db.query(
    `INSERT INTO payment_lines (id, batch_id, farmer_id, farmer_name, amount, currency, country, stage, hold_kind, bank_reference)
     VALUES ($1, $2, $3, $4, 10000, 'UGX', 'Uganda', $5, $6, $7)`,
    [
      lineId,
      batchId,
      farmerId,
      opts.name ?? 'Akera Test',
      opts.stage ?? 'payment_approved',
      opts.holdKind ?? null,
      opts.bankReference === undefined ? BANK_REF : opts.bankReference,
    ]
  );
  const otherFarmer = uuidv4();
  await db.query(`INSERT INTO farmers (farmer_id, name, phone_number, country) VALUES ($1, 'Other Member', '0752000111', 'Uganda')`, [otherFarmer]);
  const otherLineId = uuidv4();
  await db.query(
    `INSERT INTO payment_lines (id, batch_id, farmer_id, farmer_name, amount, currency, country, stage, bank_reference)
     VALUES ($1, $2, $3, 'Other Member', 5000, 'UGX', 'Uganda', 'payment_approved', 'PB-UG-UGX-20261123-001-002')`,
    [otherLineId, batchId, otherFarmer]
  );
  if (opts.setToken !== false) process.env.ZERO_AMOUNT_UAT_LINE_ID = lineId;
  return { lineId, farmerId, batchId, otherLineId };
}

const rows = async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> =>
  (await db.query(sql, params)).rows as T[];

async function count(table: string): Promise<number> {
  return (await rows<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`))[0].n;
}

async function dbState(): Promise<string> {
  return JSON.stringify({
    lines: await rows('SELECT * FROM payment_lines ORDER BY id'),
    batches: await rows('SELECT * FROM payment_batches ORDER BY id'),
    farmers: await rows('SELECT * FROM farmers ORDER BY farmer_id'),
  });
}

async function assertNothingWritten(): Promise<void> {
  assert.equal(await count('equity_payment_batches'), 0);
  assert.equal(await count('bank_transactions'), 0);
  assert.equal(await count('audit_logs'), 0);
}

const noSftp = (): SftpClientLike => {
  throw new Error('SFTP must not be used in this test');
};

/** Read queries for the runner. Logs what it ran so tests can prove nothing was written. */
function recordingQuery(sink: string[]): QueryRows {
  return async (text, params) => {
    sink.push(text);
    return (await db.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>;
  };
}

async function refused(fn: () => Promise<unknown>, match?: RegExp): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof ZeroAmountUatRefusal, `expected a refusal, got ${String(err)}`);
    if (match) assert.match((err as Error).message, match);
    return true;
  });
}

function candidate(id: string, amount: number, extra: Partial<UgandaPaymentCandidate> = {}): UgandaPaymentCandidate {
  return { paymentId: id, farmerId: uuidv4(), farmerName: 'Akera Test', mobile: WALLET, amount, ...extra };
}

// ---------------------------------------------------------------------------
// The planner seam
// ---------------------------------------------------------------------------

test('planner: an amount of 0 is rejected as INVALID_AMOUNT without the seam', () => {
  const id = uuidv4();
  const plan = planUgandaBatches([candidate(id, 0)], { maxPayments: 10, maxTotalAmount: 1_000_000 });
  assert.equal(plan.chunks.length, 0);
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['INVALID_AMOUNT']);
});

test('planner: the seam plans ONLY the named line at 0; every other 0 or invalid amount is still skipped', () => {
  const target = uuidv4();
  const otherZero = uuidv4();
  const positive = uuidv4();
  const plan = planUgandaBatches(
    [candidate(target, 10000), candidate(otherZero, 0), candidate(positive, 5000)],
    { maxPayments: 10, maxTotalAmount: 1_000_000, zeroAmountOverride: { onlyLineId: target, forceAmount: 0 } }
  );
  const accepted = plan.chunks.flat();
  assert.deepEqual(
    accepted.map((p) => [p.paymentId, p.amount]),
    [
      [target, 0],
      [positive, 5000],
    ]
  );
  assert.deepEqual(plan.skipped.map((s) => [s.paymentId, s.reason]), [[otherZero, 'INVALID_AMOUNT']]);
});

test('planner: the seam must be exactly { one line uuid, forceAmount: 0 }', () => {
  const id = uuidv4();
  const opts = { maxPayments: 10, maxTotalAmount: 1_000_000 };
  const run = (override: unknown) =>
    planUgandaBatches([candidate(id, 0)], { ...opts, zeroAmountOverride: override as never });
  assert.throws(() => run({ onlyLineId: id, forceAmount: 1 }), ZeroAmountUatRefusal);
  assert.throws(() => run({ onlyLineId: id, forceAmount: 5000 }), ZeroAmountUatRefusal);
  assert.throws(() => run({ onlyLineId: id, forceAmount: '0' }), ZeroAmountUatRefusal);
  assert.throws(() => run({ onlyLineId: 'not-a-uuid', forceAmount: 0 }), ZeroAmountUatRefusal);
  assert.throws(() => run({ onlyLineId: '', forceAmount: 0 }), ZeroAmountUatRefusal);
  assert.throws(() => run({ forceAmount: 0 }), ZeroAmountUatRefusal);
  assert.throws(() => run(null), ZeroAmountUatRefusal);
});

// ---------------------------------------------------------------------------
// The scheduler and the normal release path never pass the seam
// ---------------------------------------------------------------------------

test('safety: no source file other than the builder, the guard module and the script mentions the seam', () => {
  const srcDir = path.resolve(__dirname, '..');
  const offenders: string[] = [];
  const allowed = /^(equityBatchService|equityZeroAmountUat)\.ts$|\.test\.ts$/;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !allowed.test(entry.name)) {
        if (/zeroAmountOverride|equityZeroAmountUat/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(srcDir, full));
        }
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, [], 'scheduler, sftp service, routes and index.ts must not reference the seam');

  const scriptsDir = path.resolve(__dirname, '../../scripts');
  const scriptHits = fs
    .readdirSync(scriptsDir)
    .filter((n) => /\.ts$/.test(n) && /zeroAmountOverride/.test(fs.readFileSync(path.join(scriptsDir, n), 'utf8')));
  assert.deepEqual(scriptHits, ['send-equity-zero-amount-uat.ts']);
});

test('safety: runEquityPortalBatchCycle and runEquityBatchCycle never forward the seam, even if given it', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const empty = async (params: Record<string, unknown>) => {
    calls.push(params);
    return {
      status: 'ok' as const,
      dryRun: false,
      candidateCount: 0,
      batches: [],
      totalAmount: 0,
      skippedCount: 0,
      skippedByReason: {},
      deferredCount: 0,
    };
  };
  const env = {
    EQUITY_AUTO_SEND_ENABLED: 'true',
    EQUITY_TASK_PAYMENTS_SEND_ENABLED: 'true',
    EQUITY_SFTP_HOST: EQUITY_UAT_SFTP_HOST,
    EQUITY_SFTP_USERNAME: 'u',
    EQUITY_SFTP_PASSWORD: 'p',
    EQUITY_SFTP_HOST_KEY_SHA256: `SHA256:${'A'.repeat(43)}`,
  } as NodeJS.ProcessEnv;
  const smuggled = { zeroAmountOverride: { onlyLineId: uuidv4(), forceAmount: 0 } };

  for (const dryRun of [false, true]) {
    await runEquityPortalBatchCycle({ dryRun, ...smuggled } as never, { env, buildPortal: empty as never });
    await runEquityBatchCycle({ dryRun, ...smuggled } as never, { env, build: empty as never });
  }
  assert.equal(calls.length, 4);
  for (const c of calls) {
    assert.deepEqual(Object.keys(c).sort(), ['dryRun', 'initiatedBy']);
  }
});

test('normal release path: a released line with a 0 amount is skipped, never sent', async () => {
  const s = await seedUat();
  await db.query(`UPDATE payment_lines SET amount = 0 WHERE id = $1`, [s.lineId]);
  const result = await buildUgandaPortalBatches({ dryRun: false, initiatedBy: null });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.skippedByReason.INVALID_AMOUNT, 1);
  const sent = await rows<{ payment_line_id: string }>('SELECT payment_line_id FROM bank_transactions');
  assert.deepEqual(sent.map((r) => r.payment_line_id), [s.otherLineId]);
});

// ---------------------------------------------------------------------------
// Building through the seam
// ---------------------------------------------------------------------------

test('seam build: one file, one row, amount 0 stored; the other released line and the portal line are untouched', async () => {
  const s = await seedUat();
  const before = await dbState();

  const result = await buildUgandaPortalBatches({
    dryRun: false,
    initiatedBy: null,
    zeroAmountOverride: { onlyLineId: s.lineId, forceAmount: 0 },
  });
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].rowCount, 1);
  assert.equal(result.totalAmount, 0);

  const tx = await rows<{ payment_line_id: string; amount: number; currency: string; status: string; customer_reference: string }>(
    `SELECT payment_line_id, amount, currency, status::text AS status, customer_reference FROM bank_transactions`
  );
  assert.deepEqual(tx.map((t) => [t.payment_line_id, t.amount, t.currency, t.status, t.customer_reference]), [
    [s.lineId, 0, 'UGX', 'pending', BANK_REF],
  ]);
  assert.equal(await dbState(), before, 'payment_lines, payment_batches and farmers are unchanged');
  const audit = await rows<{ details: string }>(`SELECT details FROM audit_logs WHERE action = 'banking.batch_built'`);
  assert.equal(audit.length, 1);
  assert.equal(JSON.parse(audit[0].details).zeroAmountUat, true);

  // The real rebuild reproduces the file byte for byte (so the stored sha256 matches amount 0).
  const batchId = (await rows<{ id: string }>('SELECT id FROM equity_payment_batches'))[0].id;
  const rebuilt = await rebuildBatchFile(batchId);
  const dataLine = rebuilt.plaintext.trimEnd().split('\r\n')[1];
  assert.match(
    dataLine,
    new RegExp(`^MW,${DEBIT_ACCOUNT},,Akera Test,,,,UGX,0,,${WALLET},AIRTELMONEY-UG,OUR,\\d{2}-\\d{2}-\\d{4},${BANK_REF},$`)
  );
  assert.equal(rebuilt.plaintext.trimEnd().split('\r\n').length, 2, 'header plus exactly one row');
});

test('seam build refusals: nothing is written, and the environment refusals do not even open a connection', async () => {
  const s = await seedUat();
  const call = (lineId = s.lineId, forceAmount: unknown = 0) =>
    buildUgandaPortalBatches({
      dryRun: false,
      zeroAmountOverride: { onlyLineId: lineId, forceAmount } as never,
    });

  const envCases: Array<[string, () => void, RegExp]> = [
    ['token unset', () => delete process.env.ZERO_AMOUNT_UAT_LINE_ID, /ZERO_AMOUNT_UAT_LINE_ID is not set/],
    ['token for another line', () => (process.env.ZERO_AMOUNT_UAT_LINE_ID = uuidv4()), /does not equal/],
    ['production host', () => (process.env.EQUITY_SFTP_HOST = PROD_HOST), /not the Equity UAT host/],
    ['unknown host', () => (process.env.EQUITY_SFTP_HOST = 'sftp.example.test'), /not the Equity UAT host/],
    ['host unset', () => delete process.env.EQUITY_SFTP_HOST, /not the Equity UAT host/],
  ];
  for (const [name, breakIt, message] of envCases) {
    process.env.ZERO_AMOUNT_UAT_LINE_ID = s.lineId;
    process.env.EQUITY_SFTP_HOST = EQUITY_UAT_SFTP_HOST;
    breakIt();
    connects = 0;
    await refused(() => call(), message);
    assert.equal(connects, 0, `${name}: no database connection`);
    await assertNothingWritten();
  }

  process.env.ZERO_AMOUNT_UAT_LINE_ID = s.lineId;
  process.env.EQUITY_SFTP_HOST = EQUITY_UAT_SFTP_HOST;
  await refused(() => call(s.lineId, 1), /forceAmount must be exactly 0/);
  await refused(() => call(s.lineId, 5000), /forceAmount must be exactly 0/);
  await assertNothingWritten();
});

test('seam build refusals on the line itself: wallet, stage, release, hold, live transaction, reference, one row', async () => {
  const cases: Array<[string, Parameters<typeof seedUat>[0], RegExp, (s: Seeded) => Promise<void>?]> = [
    ['other wallet', { phone: '0752000000' }, /not the UAT wallet/],
    ['no phone', { phone: null }, /missing or not a valid/],
    ['MTN number', { phone: '0772000000' }, /not the UAT wallet/],
    ['stage sent', { stage: 'sent' }, /not an eligible candidate/],
    ['stage centre_approved', { stage: 'centre_approved' }, /not an eligible candidate/],
    ['not released', { released: false }, /not an eligible candidate/],
    ['on hold', { holdKind: 'compliance' }, /not an eligible candidate/],
    ['no bank_reference', { bankReference: null }, /no bank_reference/],
    ['blank farmer name plans zero rows', { name: '   ' }, /exactly one row/],
  ];
  for (const [name, seed, message] of cases) {
    await resetPortalTestDb(db);
    const s = await seedUat(seed);
    const before = await dbState();
    await refused(
      () => buildUgandaPortalBatches({ dryRun: false, zeroAmountOverride: { onlyLineId: s.lineId, forceAmount: 0 } }),
      message
    );
    await assertNothingWritten();
    assert.equal(await dbState(), before, `${name}: portal data unchanged`);
  }

  // A live bank transaction on the line.
  await resetPortalTestDb(db);
  const s = await seedUat();
  await db.query(
    `INSERT INTO bank_transactions (payment_line_id, amount, currency, recipient_phone, status, channel)
     VALUES ($1, 10000, 'UGX', '0751000000', 'processing', 'sftp_file')`,
    [s.lineId]
  );
  await refused(
    () => buildUgandaPortalBatches({ dryRun: false, zeroAmountOverride: { onlyLineId: s.lineId, forceAmount: 0 } }),
    /not an eligible candidate/
  );
  assert.equal(await count('equity_payment_batches'), 0);

  // A line id that does not exist.
  await resetPortalTestDb(db);
  await seedUat();
  const ghost = uuidv4();
  process.env.ZERO_AMOUNT_UAT_LINE_ID = ghost;
  await refused(
    () => buildUgandaPortalBatches({ dryRun: false, zeroAmountOverride: { onlyLineId: ghost, forceAmount: 0 } }),
    /not an eligible candidate/
  );
  await assertNothingWritten();
});

// ---------------------------------------------------------------------------
// The script
// ---------------------------------------------------------------------------

test('script arguments: dry run is the default; modes cannot be combined; one line id only', () => {
  const id = uuidv4();
  assert.deepEqual(parseZeroAmountUatArgs([id]), { lineId: id, mode: 'dry-run' });
  assert.deepEqual(parseZeroAmountUatArgs([id, '--dry-run']), { lineId: id, mode: 'dry-run' });
  assert.deepEqual(parseZeroAmountUatArgs([id, '--confirm']), { lineId: id, mode: 'confirm' });
  assert.deepEqual(parseZeroAmountUatArgs([`--line=${id}`, '--status']), { lineId: id, mode: 'status' });
  assert.throws(() => parseZeroAmountUatArgs([id, '--confirm', '--dry-run']), /only one of/);
  assert.throws(() => parseZeroAmountUatArgs([]), /Usage/);
  assert.throws(() => parseZeroAmountUatArgs([id, uuidv4()]), /Only one/);
  assert.throws(() => parseZeroAmountUatArgs([id, '--force']), /Unknown option/);
});

test('dry run: prints the row and file name (masked), writes nothing, never touches SFTP', async () => {
  const s = await seedUat({ released: false }); // before "Release to bank", as in the runbook
  const before = await dbState();
  const log: string[] = [];
  const sql: string[] = [];
  const deps: ZeroAmountUatDeps = { query: recordingQuery(sql), createClient: noSftp, log: (l) => log.push(l) };

  const result = await runZeroAmountUat({ lineId: s.lineId, mode: 'dry-run' }, deps);
  assert.equal(result.ok, true);
  const out = log.join('\n');

  assert.match(out, /DRY RUN: nothing was written/);
  assert.match(out, new RegExp(`line id\\s+: ${s.lineId}`));
  assert.ok(out.includes(`bank_reference   : ${BANK_REF}`));
  assert.match(out, /stage\s+: payment_approved/);
  assert.ok(out.includes(`${WALLET} (UAT wallet)`));
  assert.match(out, /NOT released yet/);
  assert.match(out, /File name \(before \.pgp\): TMP224_56010646936_56010646936_MD_\d{8}_DRAPIUSUG_ALL\d{14}\.csv/);
  assert.match(out, new RegExp(`MW,\\*+${DEBIT_ACCOUNT.slice(-3)},,A\\*\\*\\*,,,,UGX,0,,${WALLET},AIRTELMONEY-UG,OUR,\\d{2}-\\d{2}-\\d{4},${BANK_REF},`));
  assert.ok(!out.includes(DEBIT_ACCOUNT), 'debit account is masked');
  assert.ok(!out.includes('Akera'), 'beneficiary name is masked');
  assert.ok(!out.includes(PASSWORD), 'no secret is printed');

  assert.ok(sql.length > 0 && sql.every((t) => /^\s*SELECT/i.test(t)), 'only SELECT statements');
  assert.ok(!executed.some((t) => /^\s*(INSERT|UPDATE|DELETE|BEGIN)/i.test(t)), 'no write reached the database');
  await assertNothingWritten();
  assert.equal(await dbState(), before);
});

test('every refusal also stops a dry run, before any database read', async () => {
  const s = await seedUat({ released: false });
  const sql: string[] = [];
  const deps: ZeroAmountUatDeps = { query: recordingQuery(sql), createClient: noSftp, log: () => undefined };
  const dry = () => runZeroAmountUat({ lineId: s.lineId, mode: 'dry-run' }, deps);

  process.env.EQUITY_SFTP_HOST = PROD_HOST;
  await refused(dry, /not the Equity UAT host/);
  process.env.EQUITY_SFTP_HOST = EQUITY_UAT_SFTP_HOST;
  process.env.ZERO_AMOUNT_UAT_LINE_ID = uuidv4();
  await refused(dry, /does not equal/);
  delete process.env.ZERO_AMOUNT_UAT_LINE_ID;
  await refused(dry, /not set/);
  assert.equal(sql.length, 0, 'no query ran');
  assert.equal(connects, 0);
  await assertNothingWritten();

  // Line facts: refused after the read-only look, still nothing written.
  for (const [seed, message] of [
    [{ phone: '0752000000' }, /not the UAT wallet/],
    [{ stage: 'sent' }, /must be payment_approved/],
    [{ stage: 'paid' }, /must be payment_approved/],
    [{ bankReference: null }, /no bank_reference/],
  ] as Array<[Parameters<typeof seedUat>[0], RegExp]>) {
    await resetPortalTestDb(db);
    const bad = await seedUat({ ...seed, released: false });
    await refused(() => runZeroAmountUat({ lineId: bad.lineId, mode: 'dry-run' }, deps), message);
    await assertNothingWritten();
  }
});

test('--confirm is refused while the scheduler send or poll is on, and for a batch not yet released', async () => {
  const s = await seedUat();
  const deps: ZeroAmountUatDeps = { createClient: noSftp, log: () => undefined };
  const confirm = () => runZeroAmountUat({ lineId: s.lineId, mode: 'confirm' }, deps);

  process.env.EQUITY_AUTO_SEND_ENABLED = 'true';
  await refused(confirm, /EQUITY_AUTO_SEND_ENABLED must be turned off/);
  delete process.env.EQUITY_AUTO_SEND_ENABLED;
  process.env.EQUITY_RESPONSE_POLL_ENABLED = 'true';
  await refused(confirm, /EQUITY_RESPONSE_POLL_ENABLED must be turned off/);
  delete process.env.EQUITY_RESPONSE_POLL_ENABLED;
  assert.equal(connects, 0);
  await assertNothingWritten();

  await resetPortalTestDb(db);
  const unreleased = await seedUat({ released: false });
  await refused(
    () => runZeroAmountUat({ lineId: unreleased.lineId, mode: 'confirm' }, deps),
    /has not been released to the bank yet/
  );
  await assertNothingWritten();

  // Wrong host stops --confirm before the flags, the lookup, the build or any upload.
  process.env.EQUITY_SFTP_HOST = PROD_HOST;
  await refused(() => runZeroAmountUat({ lineId: unreleased.lineId, mode: 'confirm' }, deps), /not the Equity UAT host/);
  assert.equal(connects, 0);
  await assertNothingWritten();
});

// ---------------------------------------------------------------------------
// End to end with fake SFTP: --confirm, then a NACK through the real response poll
// ---------------------------------------------------------------------------

class UploadSftp implements SftpClientLike {
  files = new Map<string, Buffer>();
  connected = 0;
  on(): void {}
  async connect(): Promise<void> {
    this.connected++;
  }
  async put(input: Buffer, remotePath: string): Promise<void> {
    this.files.set(remotePath, input);
  }
  async stat(remotePath: string): Promise<{ size: number }> {
    const f = this.files.get(remotePath);
    if (!f) throw Object.assign(new Error('No such file'), { code: 2 });
    return { size: f.length };
  }
  async list() {
    return [];
  }
  async get(): Promise<Buffer> {
    throw new Error('not used');
  }
  async delete(): Promise<void> {}
  async end(): Promise<void> {}
}

class InboundSftp implements SftpClientLike {
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

const pollQuery: QueryFn = async (text, params) =>
  (await db.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>;
const pollTransaction: NonNullable<EquityResponseDeps['transaction']> = (fn) =>
  db.transaction(async (tx) =>
    fn(async (text, params) => (await tx.query(text, params as unknown[] | undefined)).rows as Array<Record<string, unknown>>)
  );

test('confirm uploads one amount-0 row; a NACK for it marks the line failed with the row reason', async () => {
  const s = await seedUat();
  const sftp = new UploadSftp();
  const log: string[] = [];

  // --- runbook step 4: --confirm
  const sent = await runZeroAmountUat(
    { lineId: s.lineId, mode: 'confirm' },
    { createClient: () => sftp, log: (l) => log.push(l) }
  );
  assert.equal(sent.ok, true);
  assert.equal(sent.uploaded, 1);
  assert.equal(sent.failed, 0);
  assert.equal(sent.uncertain, 0);
  assert.equal(sent.unrecorded, 0);
  assert.equal(sftp.connected, 1, 'exactly one SFTP login');
  assert.equal(sftp.files.size, 1);
  assert.match([...sftp.files.keys()][0], /\/upload\/OUTBOUND\/TMP224_.*\.csv\.pgp$/);
  assert.match(log.join('\n'), /SUCCESS: the file is on Equity UAT/);
  assert.ok(!log.join('\n').includes(PASSWORD));

  const line = (await rows<{ stage: string; amount: string }>('SELECT stage, amount FROM payment_lines WHERE id = $1', [s.lineId]))[0];
  assert.equal(line.stage, 'sent', 'the real uploader marked the line sent');
  assert.equal(Number(line.amount), 10000, 'portal line amount unchanged');
  const other = (await rows<{ stage: string }>('SELECT stage FROM payment_lines WHERE id = $1', [s.otherLineId]))[0];
  assert.equal(other.stage, 'payment_approved', 'the other released line was not sent');
  const tx = (await rows<{ status: string; amount: number }>(`SELECT status::text AS status, amount FROM bank_transactions`))[0];
  assert.deepEqual([tx.status, tx.amount], ['processing', 0]);
  assert.equal(await count('bank_transactions'), 1);
  const batch = (await rows<{ id: string; status: string; filename: string }>('SELECT id, status, filename FROM equity_payment_batches'))[0];
  assert.equal(batch.status, 'uploaded');
  const audit = await rows<{ details: string }>(`SELECT details FROM audit_logs WHERE action = 'banking.batch_sent'`);
  assert.equal(JSON.parse(audit[0].details).zeroAmountUat, true);

  // --- runbook step 5: Equity's NACK arrives; one response poll
  const stem = `56010646936_56010646936_${batch.filename.replace(/\.csv$/i, '')}`;
  const nack = [
    [stem, 'H2H7285851653727', '54307369022', '', 'RJCT', '', 'All Records Failed', '', '', '', '', '', '', '', '', ''].join(','),
    `H2H7285851653727,${BANK_REF},BT26080434535728,RJCT,VERFAL,${NACK_REASON}`,
  ].join('\n');
  const inbound = new InboundSftp().add(`NACK__${stem}.csv`, `${nack}\n`);
  const poll = await runEquityResponsePoll(
    {},
    {
      createClient: () => inbound,
      query: pollQuery,
      transaction: pollTransaction,
      env: { ...process.env, EQUITY_RESPONSE_POLL_ENABLED: 'true' },
      settle: async () => {
        throw new Error('settleTransferredPayment must not be called for portal lines');
      },
      audit: (async () => 'audit') as unknown as EquityResponseDeps['audit'],
    }
  );
  assert.equal(poll.status, 'ok');
  if (poll.status !== 'ok') return;
  assert.deepEqual(
    [poll.filesProcessed, poll.failed, poll.needsReview, poll.unmatched, poll.errors],
    [1, 1, 0, 0, 0]
  );

  const failed = (await rows<{ stage: string; fail_reason: string | null; bank_txn: string | null; amount: string }>(
    'SELECT stage, fail_reason, bank_txn, amount FROM payment_lines WHERE id = $1',
    [s.lineId]
  ))[0];
  assert.equal(failed.stage, 'failed');
  assert.equal(failed.fail_reason, NACK_REASON, 'the row reason, not the file-level fallback');
  assert.equal(failed.bank_txn, null);
  assert.equal(Number(failed.amount), 10000, 'portal line amount still unchanged');
  const failedTx = (await rows<{ status: string; equity_error_code: string; equity_error_description: string; amount: number }>(
    `SELECT status::text AS status, equity_error_code, equity_error_description, amount FROM bank_transactions`
  ))[0];
  assert.deepEqual(
    [failedTx.status, failedTx.equity_error_code, failedTx.equity_error_description, failedTx.amount],
    ['failed', 'VERFAL', NACK_REASON, 0]
  );
  assert.equal((await rows<{ status: string }>('SELECT status FROM equity_payment_batches'))[0].status, 'rejected');
  const calls = await rows<{ args: { reference: string; status: string; reason: string } }>(
    `SELECT args FROM pl2_calls WHERE fn = 'record_result_by_reference'`
  );
  assert.deepEqual(calls.map((c) => [c.args.reference, c.args.status, c.args.reason]), [[BANK_REF, 'failed', NACK_REASON]]);
  assert.equal((await rows<{ stage: string }>('SELECT stage FROM payment_lines WHERE id = $1', [s.otherLineId]))[0].stage, 'payment_approved');

  // --- --status shows the result, read-only
  const statusLog: string[] = [];
  const statusSql: string[] = [];
  const status = await runZeroAmountUat(
    { lineId: s.lineId, mode: 'status' },
    { query: recordingQuery(statusSql), createClient: noSftp, log: (l) => statusLog.push(l) }
  );
  assert.equal(status.ok, true);
  const statusOut = statusLog.join('\n');
  assert.match(statusOut, /stage\s+: failed/);
  assert.ok(statusOut.includes(`fail reason      : ${NACK_REASON}`));
  assert.match(statusOut, /status=failed amount=0 .* error_code=VERFAL batch=rejected/);
  assert.ok(statusSql.every((t) => /^\s*SELECT/i.test(t)));
});

test('a second --confirm for the same line is refused (it is no longer at payment_approved)', async () => {
  const s = await seedUat();
  const sftp = new UploadSftp();
  const first = await runZeroAmountUat({ lineId: s.lineId, mode: 'confirm' }, { createClient: () => sftp, log: () => undefined });
  assert.equal(first.ok, true);
  await refused(
    () => runZeroAmountUat({ lineId: s.lineId, mode: 'confirm' }, { createClient: noSftp, log: () => undefined }),
    /must be payment_approved/
  );
  assert.equal(await count('equity_payment_batches'), 1);
  assert.equal(sftp.connected, 1);
});
