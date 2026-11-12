import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chunkGeneratedAt,
  eastAfricaValueDateIso,
  equityUgandaBatchConfigFromEnv,
  generateUgandaBatchFile,
  maskMobile,
  planUgandaBatches,
  shouldWriteBuildAudit,
  UGANDA_CANDIDATES_SQL,
  ugandaCandidatesSql,
  type UgandaPaymentCandidate,
} from './equityBatchService';

const NO_CAP = { maxPayments: 100000, maxTotalAmount: 1_000_000_000 };

function candidate(i: number, overrides: Partial<UgandaPaymentCandidate> = {}): UgandaPaymentCandidate {
  return {
    paymentId: `pay-${i}`,
    farmerId: `farmer-${i}`,
    farmerName: `Farmer ${i}`,
    mobile: '0751000000',
    amount: 1000,
    ...overrides,
  };
}

function many(n: number): UgandaPaymentCandidate[] {
  return Array.from({ length: n }, (_, i) => candidate(i + 1));
}

test('planUgandaBatches: empty input', () => {
  const plan = planUgandaBatches([], NO_CAP);
  assert.deepEqual(plan, { chunks: [], skipped: [], deferred: [] });
});

test('planUgandaBatches: 99 fits one file, 100 splits into 99 + 1', () => {
  const exact = planUgandaBatches(many(99), NO_CAP);
  assert.deepEqual(exact.chunks.map((c) => c.length), [99]);

  const plan = planUgandaBatches(many(100), NO_CAP);
  assert.deepEqual(plan.chunks.map((c) => c.length), [99, 1]);
  assert.equal(plan.chunks[0][0].paymentId, 'pay-1');
  assert.equal(plan.chunks[1][0].paymentId, 'pay-100');
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.deferred.length, 0);
});

test('planUgandaBatches: normalises mobiles', () => {
  const plan = planUgandaBatches([candidate(1, { mobile: '+256 751 000 000' })], NO_CAP);
  assert.equal(plan.chunks[0][0].mobile, '0751000000');
});

test('planUgandaBatches: invalid mobile is skipped with a reason and no full number', () => {
  const plan = planUgandaBatches(
    [candidate(1, { mobile: '12345' }), candidate(2, { mobile: '' }), candidate(3)],
    NO_CAP
  );
  assert.deepEqual(plan.chunks.map((c) => c.length), [1]);
  assert.deepEqual(
    plan.skipped.map((s) => [s.paymentId, s.reason]),
    [
      ['pay-1', 'INVALID_MOBILE'],
      ['pay-2', 'INVALID_MOBILE'],
    ]
  );
  assert.equal(plan.skipped[0].mobileMasked, '**345');
  assert.ok(!JSON.stringify(plan.skipped).includes('12345'));
});

test('planUgandaBatches: unknown network prefix is skipped', () => {
  const plan = planUgandaBatches([candidate(1, { mobile: '0791000000' }), candidate(2)], NO_CAP);
  assert.equal(plan.chunks[0].length, 1);
  assert.deepEqual(
    plan.skipped.map((s) => [s.paymentId, s.reason]),
    [['pay-1', 'UNKNOWN_NETWORK']]
  );
});

test('planUgandaBatches: non-positive-integer amounts are skipped', () => {
  const plan = planUgandaBatches(
    [
      candidate(1, { amount: 10.5 }),
      candidate(2, { amount: 0 }),
      candidate(3, { amount: -5 }),
      candidate(4, { amount: NaN }),
      candidate(5),
    ],
    NO_CAP
  );
  assert.equal(plan.chunks[0].length, 1);
  assert.deepEqual(
    plan.skipped.map((s) => s.reason),
    ['INVALID_AMOUNT', 'INVALID_AMOUNT', 'INVALID_AMOUNT', 'INVALID_AMOUNT']
  );
});

test('planUgandaBatches: blank farmer name is skipped', () => {
  const plan = planUgandaBatches([candidate(1, { farmerName: '   ' })], NO_CAP);
  assert.equal(plan.chunks.length, 0);
  assert.equal(plan.skipped[0].reason, 'INVALID_NAME');
});

test('planUgandaBatches: maxPayments defers the excess (not an error)', () => {
  const plan = planUgandaBatches(many(10), { maxPayments: 4, maxTotalAmount: 1_000_000 });
  assert.equal(plan.chunks.flat().length, 4);
  assert.deepEqual(plan.deferred.map((d) => d.paymentId), [
    'pay-5',
    'pay-6',
    'pay-7',
    'pay-8',
    'pay-9',
    'pay-10',
  ]);
  assert.ok(plan.deferred.every((d) => d.reason === 'MAX_PAYMENTS'));
  assert.equal(plan.skipped.length, 0);
});

test('planUgandaBatches: maxTotalAmount defers the excess and keeps order', () => {
  const plan = planUgandaBatches(many(10), { maxPayments: 100, maxTotalAmount: 3500 });
  assert.equal(plan.chunks.flat().length, 3);
  assert.equal(plan.deferred.length, 7);
  assert.ok(plan.deferred.every((d) => d.reason === 'MAX_TOTAL_AMOUNT'));
  // Once the cap is hit, later (even smaller) payments stay deferred: strict oldest-first.
  const plan2 = planUgandaBatches(
    [candidate(1, { amount: 3000 }), candidate(2, { amount: 1000 }), candidate(3, { amount: 100 })],
    { maxPayments: 100, maxTotalAmount: 3500 }
  );
  assert.deepEqual(plan2.chunks.flat().map((p) => p.paymentId), ['pay-1']);
  assert.deepEqual(plan2.deferred.map((d) => d.paymentId), ['pay-2', 'pay-3']);
});

test('planUgandaBatches: a payment above the total cap on its own does not block the queue', () => {
  const plan = planUgandaBatches(
    [candidate(1, { amount: 9000 }), candidate(2, { amount: 1000 })],
    { maxPayments: 100, maxTotalAmount: 5000 }
  );
  assert.deepEqual(plan.chunks.flat().map((p) => p.paymentId), ['pay-2']);
  assert.deepEqual(plan.deferred.map((d) => [d.paymentId, d.reason]), [
    ['pay-1', 'EXCEEDS_MAX_TOTAL_AMOUNT'],
  ]);
});

test('planUgandaBatches: skipped payments do not count towards caps', () => {
  const plan = planUgandaBatches(
    [candidate(1, { mobile: 'bad' }), candidate(2), candidate(3)],
    { maxPayments: 2, maxTotalAmount: 1_000_000 }
  );
  assert.equal(plan.chunks.flat().length, 2);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.deferred.length, 0);
});

test('planUgandaBatches: rejects invalid caps', () => {
  assert.throws(() => planUgandaBatches([], { maxPayments: 0, maxTotalAmount: 10 }));
  assert.throws(() => planUgandaBatches([], { maxPayments: 10, maxTotalAmount: -1 }));
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('equityUgandaBatchConfigFromEnv: lists every missing variable in one error', () => {
  assert.throws(
    () => equityUgandaBatchConfigFromEnv({}),
    (err: Error) => {
      assert.match(err.message, /EQUITY_SFTP_CUSTOMER_ID/);
      assert.match(err.message, /EQUITY_UG_DEBIT_ACCOUNT/);
      assert.match(err.message, /EQUITY_AUTO_SEND_MAX_TOTAL/);
      assert.match(err.message, /positive integer/);
      return true;
    }
  );
});

test('equityUgandaBatchConfigFromEnv: only missing variables are listed', () => {
  assert.throws(
    () =>
      equityUgandaBatchConfigFromEnv({
        EQUITY_SFTP_CUSTOMER_ID: '56010646936',
        EQUITY_AUTO_SEND_MAX_TOTAL: '1000000',
      }),
    (err: Error) => {
      assert.match(err.message, /EQUITY_UG_DEBIT_ACCOUNT/);
      assert.doesNotMatch(err.message, /EQUITY_SFTP_CUSTOMER_ID/);
      assert.doesNotMatch(err.message, /EQUITY_AUTO_SEND_MAX_TOTAL/);
      return true;
    }
  );
});

test('equityUgandaBatchConfigFromEnv: defaults applied', () => {
  const config = equityUgandaBatchConfigFromEnv({
    EQUITY_SFTP_CUSTOMER_ID: ' 56010646936 ',
    EQUITY_UG_DEBIT_ACCOUNT: '1003200930075',
    EQUITY_AUTO_SEND_MAX_TOTAL: '2000000',
  });
  assert.deepEqual(config, {
    customerId: '56010646936',
    templateId: 'TMP224',
    debitAccountNo: '1003200930075',
    entityCode: 'DRAPIUSUG',
    filenameMiddleSegment: 'MD',
    maxPayments: 500,
    maxTotalAmount: 2_000_000,
  });
});

test('equityUgandaBatchConfigFromEnv: overrides are honoured', () => {
  const config = equityUgandaBatchConfigFromEnv({
    EQUITY_SFTP_CUSTOMER_ID: '1',
    EQUITY_UG_DEBIT_ACCOUNT: '2',
    EQUITY_AUTO_SEND_MAX_TOTAL: '3',
    EQUITY_SFTP_TEMPLATE_ID: 'TMP999',
    EQUITY_UG_ENTITY_CODE: 'OTHER',
    EQUITY_SFTP_FILENAME_MD: 'XX',
    EQUITY_AUTO_SEND_MAX_PAYMENTS: '7',
  });
  assert.equal(config.templateId, 'TMP999');
  assert.equal(config.entityCode, 'OTHER');
  assert.equal(config.filenameMiddleSegment, 'XX');
  assert.equal(config.maxPayments, 7);
});

test('equityUgandaBatchConfigFromEnv: max total must be a positive integer', () => {
  for (const bad of ['0', '-5', '1.5', 'abc', '1e6']) {
    assert.throws(
      () =>
        equityUgandaBatchConfigFromEnv({
          EQUITY_SFTP_CUSTOMER_ID: '1',
          EQUITY_UG_DEBIT_ACCOUNT: '2',
          EQUITY_AUTO_SEND_MAX_TOTAL: bad,
        }),
      /EQUITY_AUTO_SEND_MAX_TOTAL/,
      `value ${bad}`
    );
  }
});

test('equityUgandaBatchConfigFromEnv: invalid max payments is an error, not a silent default', () => {
  assert.throws(
    () =>
      equityUgandaBatchConfigFromEnv({
        EQUITY_SFTP_CUSTOMER_ID: '1',
        EQUITY_UG_DEBIT_ACCOUNT: '2',
        EQUITY_AUTO_SEND_MAX_TOTAL: '3',
        EQUITY_AUTO_SEND_MAX_PAYMENTS: 'lots',
      }),
    /EQUITY_AUTO_SEND_MAX_PAYMENTS/
  );
});

// ---------------------------------------------------------------------------
// Uniqueness across chunks
// ---------------------------------------------------------------------------

const SETTINGS = {
  customerId: '56010646936',
  templateId: 'TMP224',
  debitAccountNo: '1003200930075',
  entityCode: 'DRAPIUSUG',
  filenameMiddleSegment: 'MD',
};

test('chunkGeneratedAt: whole seconds, plus chunk index', () => {
  const now = new Date('2026-11-06T12:47:19.789Z');
  assert.equal(chunkGeneratedAt(now, 0).toISOString(), '2026-11-06T12:47:19.000Z');
  assert.equal(chunkGeneratedAt(now, 2).toISOString(), '2026-11-06T12:47:21.000Z');
});

test('eastAfricaValueDateIso: uses the Kampala calendar date', () => {
  // 22:30 UTC is already the next day in Kampala (UTC+3)
  assert.equal(eastAfricaValueDateIso(new Date('2026-11-06T22:30:00Z')), '2026-11-07');
  assert.equal(eastAfricaValueDateIso(new Date('2026-11-06T12:00:00Z')), '2026-11-06');
});

test('files for chunks at now+0s, +1s, +2s have unique filenames and references', () => {
  const now = new Date('2026-11-06T12:47:19.500Z');
  const plan = planUgandaBatches(many(250), NO_CAP);
  assert.deepEqual(plan.chunks.map((c) => c.length), [99, 99, 52]);

  const files = plan.chunks.map((chunk, index) =>
    generateUgandaBatchFile(
      SETTINGS,
      chunkGeneratedAt(now, index),
      chunk.map((p, i) => ({
        bankTransactionId: `00000000-0000-0000-0000-${String(index * 100 + i).padStart(12, '0')}`,
        beneficiaryName: p.farmerName,
        beneficiaryMobileNo: p.mobile,
        amount: p.amount,
      }))
    )
  );

  const filenames = files.map((f) => f.filename);
  assert.equal(new Set(filenames).size, 3);
  assert.match(filenames[0], /_DRAPIUSUG_ALL20261106154719\.csv$/);
  assert.match(filenames[1], /_DRAPIUSUG_ALL20261106154720\.csv$/);
  assert.match(filenames[2], /_DRAPIUSUG_ALL20261106154721\.csv$/);

  const refs = files.flatMap((f) => f.customerReferences);
  assert.equal(refs.length, 250);
  assert.equal(new Set(refs).size, 250);
  assert.equal(files[0].customerReferences[0], 'DU2026110615471901');
  assert.equal(files[1].customerReferences[0], 'DU2026110615472001');
  assert.equal(files[0].customerReferences[98], 'DU2026110615471999');

  // Identical input regenerates an identical file (what rebuildBatchFile relies on).
  const again = generateUgandaBatchFile(
    SETTINGS,
    chunkGeneratedAt(now, 1),
    plan.chunks[1].map((p, i) => ({
      bankTransactionId: `other-${i}`,
      beneficiaryName: p.farmerName,
      beneficiaryMobileNo: p.mobile,
      amount: p.amount,
    }))
  );
  assert.equal(again.sha256, files[1].sha256);
});

test('maskMobile: keeps only the last 3 digits', () => {
  assert.equal(maskMobile('0751000123'), '*******123');
  assert.equal(maskMobile('+256751000123'), '*********123');
  assert.equal(maskMobile('12'), '***');
  assert.equal(maskMobile(null), '***');
});

// ---------------------------------------------------------------------------
// Selection rules and audit rule (no database: assert on the SQL text / pure helpers)
// ---------------------------------------------------------------------------

test('candidate SQL excludes live bank transactions on ANY channel', () => {
  const sql = UGANDA_CANDIDATES_SQL.replace(/\s+/g, ' ');
  assert.match(sql, /NOT EXISTS \( SELECT 1 FROM bank_transactions bt WHERE bt\.payment_id = p\.id AND bt\.status::text = ANY\(\$1::text\[\]\) \)/);
  // The first (live transaction) clause has no channel filter; the second (bank-rejected) does.
  const firstClause = sql.slice(sql.indexOf('NOT EXISTS'), sql.indexOf('NOT EXISTS', sql.indexOf('NOT EXISTS') + 1));
  assert.doesNotMatch(firstClause, /channel/);
  assert.match(sql, /payment_status = 'pending'/);
  assert.match(sql, /LOWER\(TRIM\(f\.country\)\) = 'uganda'/);
  assert.match(sql, /FOR UPDATE OF p SKIP LOCKED/);
});

test('shouldWriteBuildAudit: not for empty runs, yes when batches, skipped or deferred', () => {
  assert.equal(shouldWriteBuildAudit({ batchCount: 0, skippedCount: 0, deferredCount: 0 }), false);
  assert.equal(shouldWriteBuildAudit({ batchCount: 1, skippedCount: 0, deferredCount: 0 }), true);
  assert.equal(shouldWriteBuildAudit({ batchCount: 0, skippedCount: 2, deferredCount: 0 }), true);
  assert.equal(shouldWriteBuildAudit({ batchCount: 0, skippedCount: 0, deferredCount: 3 }), true);
});

test('candidate SQL: unverified payments excluded only when verification is required', () => {
  const off = ugandaCandidatesSql(false).replace(/\s+/g, ' ');
  assert.doesNotMatch(off, /verification_status/);
  assert.equal(UGANDA_CANDIDATES_SQL, ugandaCandidatesSql(false));

  const on = ugandaCandidatesSql(true).replace(/\s+/g, ' ');
  assert.match(on, /AND p\.verification_status::text IS DISTINCT FROM 'unverified'/);
  // The rest of the selection rules are unchanged.
  assert.match(on, /payment_status = 'pending'/);
  assert.match(on, /NOT EXISTS/);
  assert.match(on, /FOR UPDATE OF p SKIP LOCKED/);
});

test('buildUgandaBatches (dry run) applies REQUIRE_PAYMENT_VERIFICATION to the candidate query', async () => {
  const { Pool } = await import('pg');
  const { buildUgandaBatches } = await import('./equityBatchService');

  const originalConnect = Pool.prototype.connect;
  const seenSql: string[] = [];
  (Pool.prototype as unknown as { connect: unknown }).connect = async function () {
    return {
      query: async (text: string) => {
        seenSql.push(text);
        if (text.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
  };

  const saved = { ...process.env };
  process.env.DATABASE_URL = 'postgres://stub:stub@127.0.0.1:1/stub';
  process.env.EQUITY_SFTP_CUSTOMER_ID = '56010646936';
  process.env.EQUITY_UG_DEBIT_ACCOUNT = '1003200930075';
  process.env.EQUITY_AUTO_SEND_MAX_TOTAL = '1000000';
  try {
    delete process.env.REQUIRE_PAYMENT_VERIFICATION;
    await buildUgandaBatches({ dryRun: true });
    process.env.REQUIRE_PAYMENT_VERIFICATION = 'true';
    await buildUgandaBatches({ dryRun: true });
    process.env.REQUIRE_PAYMENT_VERIFICATION = 'false';
    await buildUgandaBatches({ dryRun: true });
  } finally {
    (Pool.prototype as unknown as { connect: unknown }).connect = originalConnect;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }

  const candidateSql = seenSql.filter((t) => t.includes('FROM payments p'));
  assert.equal(candidateSql.length, 3);
  assert.doesNotMatch(candidateSql[0], /verification_status/);
  assert.match(candidateSql[1], /verification_status::text IS DISTINCT FROM 'unverified'/);
  assert.doesNotMatch(candidateSql[2], /verification_status/);
});

test('candidate SQL excludes payments the bank rejected (failed sftp_file row, any code but UPLOAD_FAILED)', () => {
  for (const sql of [ugandaCandidatesSql(false), ugandaCandidatesSql(true)]) {
    const flat = sql.replace(/\s+/g, ' ');
    assert.match(
      flat,
      /AND NOT EXISTS \( SELECT 1 FROM bank_transactions bf WHERE bf\.payment_id = p\.id AND bf\.channel = 'sftp_file' AND bf\.status::text = 'failed' AND bf\.equity_error_code IS DISTINCT FROM 'UPLOAD_FAILED' \)/
    );
    // Our own upload failures stay selectable: the exclusion is only for other codes.
    assert.doesNotMatch(flat, /equity_error_code <> 'UPLOAD_FAILED'/);
    // The blocking-status rule is still there.
    assert.match(flat, /bt\.status::text = ANY\(\$1::text\[\]\)/);
  }
});
