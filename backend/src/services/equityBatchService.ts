/**
 * Equity Bank (Uganda) payment batch builder.
 *
 * Selects pending Uganda payments, plans one or more files of at most 99 lines each,
 * generates the CSVs, records them in `equity_payment_batches` / `bank_transactions`
 * and PGP-encrypts them for Equity.
 *
 * SAFETY: this module never uploads anything and never touches SFTP. It must not be
 * imported from a route or from index.ts until the upload step is built and reviewed.
 *
 * Phone numbers: `farmers.phone_number` is stored in plain text (see farmerService.createFarmer;
 * only id number and bank account are encrypted). We still pass the value through `decryptField`,
 * which is a no-op for plain values, so an encrypted value would also work. Full phone numbers
 * are never logged or put in error messages — use `maskMobile`.
 */

import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/database';
import { logAudit } from './auditService';
import { decryptField } from './encryptionService';
import {
  EQUITY_UG_DEFAULT_ENTITY_CODE,
  getEastAfricaTimeParts,
  getUgandaServiceProvider,
  normalizeUgandaMobile,
} from './equityCountryConfig';
import {
  EQUITY_UG_MAX_LINES_PER_FILE,
  generateEquityMwBatchFile,
  type EquityBatchFileConfig,
  type EquityGeneratedBatchFile,
  type EquityMwPaymentLine,
} from './equityCsvGenerator';
import { encryptPayloadForEquity, loadEquityPublicKeyFromEnv } from './equityPgpService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fixed advisory-lock key for the whole builder run ("EQBG"). */
export const EQUITY_BATCH_BUILD_LOCK_KEY = 1162036807;

export const EQUITY_UG_DEFAULT_TEMPLATE_ID = 'TMP224';
export const EQUITY_UG_DEFAULT_FILENAME_MD = 'MD';
export const EQUITY_AUTO_SEND_DEFAULT_MAX_PAYMENTS = 500;

const SFTP_CHANNEL = 'sftp_file';
/** A payment with a bank_transactions row in one of these states (any channel) is never selected. */
const BLOCKING_TX_STATUSES = ['pending', 'processing', 'completed'] as const;
/** Cap on skipped entries copied into the audit log details. */
const AUDIT_SKIPPED_SAMPLE_LIMIT = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask a phone number: only the last 3 digits remain visible. Safe for logs. */
export function maskMobile(value: unknown): string {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (digits.length <= 3) return '*'.repeat(Math.max(digits.length, 3));
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

/**
 * Unique generation time per chunk: `now` truncated to whole seconds plus `chunkIndex`
 * seconds, so every file in a run gets its own file-name timestamp and line references.
 */
export function chunkGeneratedAt(now: Date, chunkIndex: number): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000 + chunkIndex * 1000);
}

/** Africa/Kampala calendar date of an instant as YYYY-MM-DD (for the `value_date` column). */
export function eastAfricaValueDateIso(date: Date): string {
  const t = getEastAfricaTimeParts(date);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function isPositiveSafeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
}

// ---------------------------------------------------------------------------
// Planning (pure — no database access)
// ---------------------------------------------------------------------------

export type UgandaPaymentCandidate = {
  paymentId: string;
  farmerId: string;
  farmerName: string;
  /** Raw mobile as stored on the farmer record. Never logged. */
  mobile: string;
  amount: number;
};

export type PlannedUgandaPayment = {
  paymentId: string;
  farmerId: string;
  farmerName: string;
  /** Normalised 10-digit local form, e.g. 0751000000. */
  mobile: string;
  amount: number;
};

export type SkipReason = 'INVALID_MOBILE' | 'UNKNOWN_NETWORK' | 'INVALID_AMOUNT' | 'INVALID_NAME';

export type SkippedPayment = {
  paymentId: string;
  farmerId: string;
  reason: SkipReason;
  /** Masked (last 3 digits only) — safe to log. */
  mobileMasked: string;
};

export type DeferReason = 'MAX_PAYMENTS' | 'MAX_TOTAL_AMOUNT' | 'EXCEEDS_MAX_TOTAL_AMOUNT';

export type DeferredPayment = {
  paymentId: string;
  farmerId: string;
  amount: number;
  reason: DeferReason;
};

export type PlanUgandaBatchesOptions = {
  /** Maximum number of payments accepted in this run. */
  maxPayments: number;
  /** Maximum total amount (UGX, whole units) accepted in this run. */
  maxTotalAmount: number;
};

export type UgandaBatchPlan = {
  /** Chunks of at most 99 payments, in input order. */
  chunks: PlannedUgandaPayment[][];
  skipped: SkippedPayment[];
  deferred: DeferredPayment[];
};

/**
 * Validate, cap and split candidates into files. Pure: no database, no clock.
 *
 * - Invalid mobile / unknown network / non-positive-integer amount / blank name → `skipped`.
 * - Caps are applied in input order (oldest first). Once the run cap is reached, everything
 *   after it is `deferred`. A payment that on its own exceeds `maxTotalAmount` is deferred
 *   individually (reason EXCEEDS_MAX_TOTAL_AMOUNT) so it cannot block the queue behind it.
 *   Deferral is not an error — those payments stay pending for a later run.
 */
export function planUgandaBatches(
  candidates: readonly UgandaPaymentCandidate[],
  options: PlanUgandaBatchesOptions
): UgandaBatchPlan {
  if (!isPositiveSafeInteger(options.maxPayments)) {
    throw new Error('maxPayments must be a positive integer');
  }
  if (!isPositiveSafeInteger(options.maxTotalAmount)) {
    throw new Error('maxTotalAmount must be a positive integer');
  }

  const skipped: SkippedPayment[] = [];
  const deferred: DeferredPayment[] = [];
  const accepted: PlannedUgandaPayment[] = [];

  let total = 0;
  let capReason: DeferReason | null = null;

  for (const c of candidates) {
    const skip = (reason: SkipReason) =>
      skipped.push({
        paymentId: c.paymentId,
        farmerId: c.farmerId,
        reason,
        mobileMasked: maskMobile(c.mobile),
      });

    let mobile: string;
    try {
      mobile = normalizeUgandaMobile(typeof c.mobile === 'string' ? c.mobile : '');
    } catch {
      skip('INVALID_MOBILE');
      continue;
    }
    try {
      getUgandaServiceProvider(mobile);
    } catch {
      skip('UNKNOWN_NETWORK');
      continue;
    }
    if (!isPositiveSafeInteger(c.amount)) {
      skip('INVALID_AMOUNT');
      continue;
    }
    if (typeof c.farmerName !== 'string' || c.farmerName.trim() === '') {
      skip('INVALID_NAME');
      continue;
    }

    const defer = (reason: DeferReason) =>
      deferred.push({
        paymentId: c.paymentId,
        farmerId: c.farmerId,
        amount: c.amount,
        reason,
      });

    if (capReason) {
      defer(capReason);
      continue;
    }
    if (c.amount > options.maxTotalAmount) {
      defer('EXCEEDS_MAX_TOTAL_AMOUNT');
      continue;
    }
    if (accepted.length >= options.maxPayments) {
      capReason = 'MAX_PAYMENTS';
      defer(capReason);
      continue;
    }
    if (total + c.amount > options.maxTotalAmount) {
      capReason = 'MAX_TOTAL_AMOUNT';
      defer(capReason);
      continue;
    }

    total += c.amount;
    accepted.push({
      paymentId: c.paymentId,
      farmerId: c.farmerId,
      farmerName: c.farmerName.trim(),
      mobile,
      amount: c.amount,
    });
  }

  const chunks: PlannedUgandaPayment[][] = [];
  for (let i = 0; i < accepted.length; i += EQUITY_UG_MAX_LINES_PER_FILE) {
    chunks.push(accepted.slice(i, i + EQUITY_UG_MAX_LINES_PER_FILE));
  }

  return { chunks, skipped, deferred };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type EquityUgandaBatchConfig = {
  customerId: string;
  templateId: string;
  debitAccountNo: string;
  entityCode: string;
  filenameMiddleSegment: string;
  maxPayments: number;
  maxTotalAmount: number;
};

function parsePositiveIntegerEnv(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return isPositiveSafeInteger(n) ? n : null;
}

/**
 * Read Uganda batch settings from the environment. Throws ONE error that lists every
 * missing or invalid variable.
 */
export function equityUgandaBatchConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): EquityUgandaBatchConfig {
  const trimmed = (name: string): string | undefined => env[name]?.trim() || undefined;

  const customerId = trimmed('EQUITY_SFTP_CUSTOMER_ID');
  const debitAccountNo = trimmed('EQUITY_UG_DEBIT_ACCOUNT');
  const maxTotalRaw = trimmed('EQUITY_AUTO_SEND_MAX_TOTAL');
  const maxPaymentsRaw = trimmed('EQUITY_AUTO_SEND_MAX_PAYMENTS');

  const problems: string[] = [];
  if (!customerId) problems.push('EQUITY_SFTP_CUSTOMER_ID (missing)');
  if (!debitAccountNo) problems.push('EQUITY_UG_DEBIT_ACCOUNT (missing)');

  let maxTotalAmount = 0;
  if (!maxTotalRaw) {
    problems.push('EQUITY_AUTO_SEND_MAX_TOTAL (missing; must be a positive integer)');
  } else {
    const parsed = parsePositiveIntegerEnv(maxTotalRaw);
    if (parsed === null) {
      problems.push('EQUITY_AUTO_SEND_MAX_TOTAL (invalid; must be a positive integer)');
    } else {
      maxTotalAmount = parsed;
    }
  }

  let maxPayments = EQUITY_AUTO_SEND_DEFAULT_MAX_PAYMENTS;
  if (maxPaymentsRaw) {
    const parsed = parsePositiveIntegerEnv(maxPaymentsRaw);
    if (parsed === null) {
      problems.push('EQUITY_AUTO_SEND_MAX_PAYMENTS (invalid; must be a positive integer)');
    } else {
      maxPayments = parsed;
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid Equity Uganda batch configuration: ${problems.join('; ')}`);
  }

  return {
    customerId: customerId!,
    templateId: trimmed('EQUITY_SFTP_TEMPLATE_ID') ?? EQUITY_UG_DEFAULT_TEMPLATE_ID,
    debitAccountNo: debitAccountNo!,
    entityCode: trimmed('EQUITY_UG_ENTITY_CODE') ?? EQUITY_UG_DEFAULT_ENTITY_CODE,
    filenameMiddleSegment: trimmed('EQUITY_SFTP_FILENAME_MD') ?? EQUITY_UG_DEFAULT_FILENAME_MD,
    maxPayments,
    maxTotalAmount,
  };
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

export type UgandaFileSettings = Pick<
  EquityUgandaBatchConfig,
  'customerId' | 'templateId' | 'debitAccountNo' | 'entityCode' | 'filenameMiddleSegment'
>;

/** Generate one Uganda file. All lines and the file name share the `generatedAt` timestamp. */
export function generateUgandaBatchFile(
  settings: UgandaFileSettings,
  generatedAt: Date,
  lines: EquityMwPaymentLine[]
): EquityGeneratedBatchFile {
  const fileConfig: EquityBatchFileConfig = {
    country: 'UG',
    templateId: settings.templateId,
    customerId: settings.customerId,
    entityCode: settings.entityCode,
    filenameMiddleSegment: settings.filenameMiddleSegment,
    debitAccountNo: settings.debitAccountNo,
    generatedAt,
  };
  return generateEquityMwBatchFile(fileConfig, lines);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export type BuiltUgandaBatch = {
  /** `null` in a dry run: nothing was written. */
  batchId: string | null;
  /** Encrypted file name (plaintext name + `.pgp`). */
  filename: string;
  rowCount: number;
  totalAmount: number;
  /** ASCII-armoured PGP message. Absent in a dry run. */
  encrypted?: string;
};

export type BuildUgandaBatchesResult =
  | { status: 'locked' }
  | {
      status: 'ok';
      dryRun: boolean;
      candidateCount: number;
      batches: BuiltUgandaBatch[];
      totalAmount: number;
      skippedCount: number;
      skippedByReason: Partial<Record<SkipReason, number>>;
      deferredCount: number;
    };

type CandidateRow = {
  payment_id: string;
  farmer_id: string;
  farmer_name: string;
  phone_number: string | null;
  amount: number | string | null;
};

function readFarmerMobile(stored: string | null): string {
  if (!stored) return '';
  try {
    return decryptField(stored); // no-op for plain values
  } catch {
    return ''; // never include the stored value in an error
  }
}

/**
 * Pending Uganda payments with no live bank transaction on ANY channel (h2h_api or sftp_file).
 * `bt.status` is a Postgres enum (bank_transaction_status), so it is cast to text for the
 * comparison. Exported so tests can assert on the selection rules without a database.
 */
export const UGANDA_CANDIDATES_SQL = `SELECT p.id AS payment_id, p.farmer_id, f.name AS farmer_name, f.phone_number, p.amount
       FROM payments p
       JOIN farmers f ON f.farmer_id = p.farmer_id
      WHERE p.payment_status = 'pending'
        AND LOWER(TRIM(f.country)) = 'uganda'
        AND NOT EXISTS (
          SELECT 1 FROM bank_transactions bt
           WHERE bt.payment_id = p.id
             AND bt.status::text = ANY($1::text[])
        )
      ORDER BY p.created_at ASC, p.id ASC
      FOR UPDATE OF p SKIP LOCKED`;

async function selectCandidates(client: PoolClient): Promise<UgandaPaymentCandidate[]> {
  const res = await client.query<CandidateRow>(UGANDA_CANDIDATES_SQL, [[...BLOCKING_TX_STATUSES]]);
  return res.rows.map((r) => ({
    paymentId: String(r.payment_id),
    farmerId: String(r.farmer_id),
    farmerName: r.farmer_name ?? '',
    mobile: readFarmerMobile(r.phone_number),
    amount: r.amount === null ? NaN : Number(r.amount),
  }));
}

/** A run that found nothing (no batches, nothing skipped or deferred) is not audited. */
export function shouldWriteBuildAudit(counts: {
  batchCount: number;
  skippedCount: number;
  deferredCount: number;
}): boolean {
  return counts.batchCount > 0 || counts.skippedCount > 0 || counts.deferredCount > 0;
}

function countByReason(skipped: SkippedPayment[]): Partial<Record<SkipReason, number>> {
  const out: Partial<Record<SkipReason, number>> = {};
  for (const s of skipped) out[s.reason] = (out[s.reason] ?? 0) + 1;
  return out;
}

function sumAmounts(payments: { amount: number }[]): number {
  return payments.reduce((acc, p) => acc + p.amount, 0);
}

export async function buildUgandaBatches(params: {
  dryRun: boolean;
  now?: Date;
  initiatedBy?: string | null;
}): Promise<BuildUgandaBatchesResult> {
  const config = equityUgandaBatchConfigFromEnv();
  const now = params.now ?? new Date();
  const initiatedBy = params.initiatedBy ?? null;
  const { dryRun } = params;

  // Fail before touching the database if we could not encrypt afterwards.
  if (!dryRun) {
    await loadEquityPublicKeyFromEnv();
  }

  const client = await getPool().connect();

  type GeneratedBatch = {
    batchId: string | null;
    file: EquityGeneratedBatchFile;
    totalAmount: number;
  };
  const generated: GeneratedBatch[] = [];
  let candidateCount = 0;
  let skipped: SkippedPayment[] = [];
  let deferredCount = 0;

  try {
    await client.query('BEGIN');

    const lockRes = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS locked',
      [EQUITY_BATCH_BUILD_LOCK_KEY]
    );
    if (!lockRes.rows[0]?.locked) {
      await client.query('ROLLBACK');
      return { status: 'locked' };
    }

    const candidates = await selectCandidates(client);
    candidateCount = candidates.length;

    const plan = planUgandaBatches(candidates, {
      maxPayments: config.maxPayments,
      maxTotalAmount: config.maxTotalAmount,
    });
    skipped = plan.skipped;
    deferredCount = plan.deferred.length;

    for (let index = 0; index < plan.chunks.length; index++) {
      const chunk = plan.chunks[index];
      const generatedAt = chunkGeneratedAt(now, index);
      const txIds = chunk.map(() => uuidv4());
      const file = generateUgandaBatchFile(
        config,
        generatedAt,
        chunk.map((p, i) => ({
          bankTransactionId: txIds[i],
          beneficiaryName: p.farmerName,
          beneficiaryMobileNo: p.mobile,
          amount: p.amount,
        }))
      );
      const totalAmount = sumAmounts(chunk);

      if (dryRun) {
        generated.push({ batchId: null, file, totalAmount });
        continue;
      }

      const valueDate = eastAfricaValueDateIso(generatedAt);
      // Daily counter per customer/value date. Safe: we hold the run-level advisory lock.
      // Not used in the Uganda file name; the column is NOT NULL and part of a unique key.
      const seqRes = await client.query<{ next_seq: number }>(
        `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_seq
           FROM equity_payment_batches
          WHERE customer_id = $1 AND value_date = $2::date`,
        [config.customerId, valueDate]
      );
      const sequenceNo = Number(seqRes.rows[0].next_seq);

      const batchId = uuidv4();
      await client.query(
        `INSERT INTO equity_payment_batches (
           id, customer_id, template_id, entity_code, filename, sequence_no, value_date,
           debit_account_no, status, row_count, outbound_sha256, generated_at, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, 'generated', $9, $10, $11, $12)`,
        [
          batchId,
          config.customerId,
          config.templateId,
          config.entityCode,
          file.filename,
          sequenceNo,
          valueDate,
          config.debitAccountNo,
          chunk.length,
          file.sha256,
          generatedAt,
          initiatedBy,
        ]
      );

      for (let i = 0; i < chunk.length; i++) {
        const p = chunk[i];
        await client.query(
          `INSERT INTO bank_transactions (
             id, payment_id, farmer_id, amount, currency, recipient_phone, status, initiated_by,
             batch_id, customer_reference, channel
           ) VALUES ($1, $2, $3, $4, 'UGX', $5, 'pending', $6, $7, $8, $9)`,
          [
            txIds[i],
            p.paymentId,
            p.farmerId,
            p.amount,
            p.mobile,
            initiatedBy,
            batchId,
            file.customerReferences[i],
            SFTP_CHANNEL,
          ]
        );
      }

      generated.push({ batchId, file, totalAmount });
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  const totalAmount = generated.reduce((acc, g) => acc + g.totalAmount, 0);
  const summaryBase = {
    status: 'ok' as const,
    dryRun,
    candidateCount,
    totalAmount,
    skippedCount: skipped.length,
    skippedByReason: countByReason(skipped),
    deferredCount,
  };

  if (dryRun) {
    return {
      ...summaryBase,
      batches: generated.map((g) => ({
        batchId: null,
        filename: `${g.file.filename}.pgp`,
        rowCount: g.file.rows.length,
        totalAmount: g.totalAmount,
      })),
    };
  }

  // The transaction is committed. Encrypt now; if this fails the batches still exist and
  // can be recreated with rebuildBatchFile().
  const batches: BuiltUgandaBatch[] = [];
  try {
    for (const g of generated) {
      const { armoredMessage } = await encryptPayloadForEquity(g.file.content, {
        filename: g.file.filename,
      });
      batches.push({
        batchId: g.batchId,
        filename: `${g.file.filename}.pgp`,
        rowCount: g.file.rows.length,
        totalAmount: g.totalAmount,
        encrypted: armoredMessage,
      });
    }
  } catch (err) {
    const ids = generated.map((g) => g.batchId).join(', ');
    const reason = err instanceof Error ? err.message : 'unknown error';
    throw new Error(
      `Equity batches were saved (batch ids: ${ids}) but encryption failed: ${reason}. Use rebuildBatchFile(batchId) to regenerate each file.`
    );
  }

  if (
    !shouldWriteBuildAudit({
      batchCount: batches.length,
      skippedCount: skipped.length,
      deferredCount,
    })
  ) {
    return { ...summaryBase, batches };
  }

  try {
    await logAudit({
      userId: initiatedBy ?? undefined,
      action: 'banking.batch_built',
      category: 'financial',
      resourceType: 'equity_payment_batch',
      resourceId: batches[0]?.batchId ?? undefined,
      details: {
        country: 'UG',
        candidateCount,
        batchCount: batches.length,
        batchIds: batches.map((b) => b.batchId),
        rowCounts: batches.map((b) => b.rowCount),
        totalAmount,
        skippedCount: skipped.length,
        skippedByReason: summaryBase.skippedByReason,
        skippedSample: skipped.slice(0, AUDIT_SKIPPED_SAMPLE_LIMIT).map((s) => ({
          paymentId: s.paymentId,
          reason: s.reason,
          mobile: s.mobileMasked,
        })),
        deferredCount,
      },
      success: true,
    });
  } catch (err) {
    // Do not lose the encrypted files because the audit insert failed; the batch rows exist.
    console.error(
      '[equityBatchService] audit log write failed:',
      err instanceof Error ? err.message : 'unknown error'
    );
  }

  return { ...summaryBase, batches };
}

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

export type RebuiltBatchFile = {
  batchId: string;
  /** Encrypted file name (plaintext name + `.pgp`). */
  filename: string;
  rowCount: number;
  totalAmount: number;
  sha256: string;
  /** Plaintext CSV (contains phone numbers — never log it). */
  plaintext: string;
  /** ASCII-armoured PGP message. */
  encrypted: string;
};

type BatchRow = {
  id: string;
  customer_id: string;
  template_id: string;
  entity_code: string;
  filename: string;
  debit_account_no: string;
  row_count: number;
  outbound_sha256: string | null;
  generated_at: Date;
};

type BatchTxRow = {
  amount: number | string;
  recipient_phone: string;
  customer_reference: string;
  farmer_name: string | null;
};

/**
 * Regenerate the identical plaintext (and a fresh encryption of it) for an existing batch,
 * from the stored generated_at, filename and bank_transactions. Throws if the result does not
 * match the stored sha256, so a changed farmer name/number can never be uploaded unnoticed.
 * The PGP ciphertext differs on every call by design; the plaintext is identical.
 */
export async function rebuildBatchFile(batchId: string): Promise<RebuiltBatchFile> {
  const pool = getPool();

  const batchRes = await pool.query<BatchRow>(
    `SELECT id, customer_id, template_id, entity_code, filename, debit_account_no,
            row_count, outbound_sha256, generated_at
       FROM equity_payment_batches WHERE id = $1`,
    [batchId]
  );
  const batch = batchRes.rows[0];
  if (!batch) throw new Error(`Equity batch ${batchId} not found`);
  if (!batch.outbound_sha256) {
    throw new Error(`Equity batch ${batchId} has no stored outbound_sha256; cannot verify rebuild`);
  }

  const txRes = await pool.query<BatchTxRow>(
    `SELECT bt.amount, bt.recipient_phone, bt.customer_reference, f.name AS farmer_name
       FROM bank_transactions bt
       LEFT JOIN farmers f ON f.farmer_id = bt.farmer_id
      WHERE bt.batch_id = $1
      ORDER BY bt.customer_reference ASC`,
    [batchId]
  );
  const txs = txRes.rows;
  if (txs.length !== batch.row_count) {
    throw new Error(
      `Equity batch ${batchId} has ${txs.length} transactions but row_count is ${batch.row_count}`
    );
  }
  if (txs.some((t) => !t.farmer_name)) {
    throw new Error(`Equity batch ${batchId}: a beneficiary name is missing; cannot rebuild`);
  }

  const file = generateUgandaBatchFile(
    {
      customerId: batch.customer_id,
      templateId: batch.template_id,
      debitAccountNo: batch.debit_account_no,
      entityCode: batch.entity_code,
      filenameMiddleSegment:
        process.env.EQUITY_SFTP_FILENAME_MD?.trim() || EQUITY_UG_DEFAULT_FILENAME_MD,
    },
    new Date(batch.generated_at),
    txs.map((t, i) => ({
      bankTransactionId: `${batchId}:${i}`,
      beneficiaryName: t.farmer_name as string,
      beneficiaryMobileNo: t.recipient_phone,
      amount: Number(t.amount),
    }))
  );

  if (file.filename !== batch.filename) {
    throw new Error(
      `Rebuilt file name ${file.filename} does not match stored ${batch.filename} for batch ${batchId}`
    );
  }
  if (file.customerReferences.some((ref, i) => ref !== txs[i].customer_reference)) {
    throw new Error(`Rebuilt customer references do not match stored ones for batch ${batchId}`);
  }
  if (file.sha256 !== batch.outbound_sha256 || sha256Hex(file.content) !== batch.outbound_sha256) {
    throw new Error(
      `Rebuilt file for batch ${batchId} does not match stored outbound_sha256 (expected ${batch.outbound_sha256}, got ${file.sha256})`
    );
  }

  const { armoredMessage } = await encryptPayloadForEquity(file.content, {
    filename: file.filename,
  });

  return {
    batchId,
    filename: `${file.filename}.pgp`,
    rowCount: txs.length,
    totalAmount: txs.reduce((acc, t) => acc + Number(t.amount), 0),
    sha256: file.sha256,
    plaintext: file.content,
    encrypted: armoredMessage,
  };
}
