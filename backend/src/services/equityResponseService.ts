/**
 * Equity Bank (Uganda) response processor: ACK, NACK and PSR files.
 *
 * Polls Equity's INBOUND SFTP directory (one connection attempt, read-only), downloads files
 * we have not stored yet, decrypts them when they are .pgp, parses them and applies each file
 * to `equity_payment_batches` / `bank_transactions` in ONE database transaction.
 *
 * SAFETY:
 * - Never deletes, renames or moves anything on the server (only list + get are used).
 * - Not imported from any route or from index.ts; there is no scheduler. Disabled unless
 *   EQUITY_RESPONSE_POLL_ENABLED === 'true'.
 * - PSR `Status` is authoritative. Only 'Success' completes a payment and only 'Failed' fails
 *   it; anything else (including 'Verification Failure') is left 'processing' for a human.
 *   The Error Description alone is never treated as a failure (successful rows carry the
 *   literal text "Success" there).
 * - Portal payment lines (bank_transactions.payment_line_id) are NOT settled here: the verdict is
 *   handed to the portal with pl2_system_record_result inside the same database transaction as
 *   the file ('paid' for PSR Success, 'failed' for NACK and PSR Failed). settleTransferredPayment
 *   is never called for them. Unknown / 'Verification Failure' leaves the line at 'sent'
 *   (counted as needsReview). A thrown pl2 call rolls the file back; it is retried next poll.
 * - Counts only in audit entries and return values. Response contents (names, account
 *   numbers) are stored in equity_response_files but never logged. The SFTP password and the
 *   PGP key/passphrase are never logged or returned.
 */

import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { getPool, query as dbQuery } from '../db/database';
import { logAudit } from './auditService';
import { decryptEquityResponse } from './equityPgpService';
import {
  detectEquityResponseKind,
  parseEquityResponseFile,
  type EquityAckParseResult,
  type EquityNackParseResult,
  type EquityPsrParseResult,
} from './equityResponseParsers';
import {
  connectEquitySftp,
  describeError,
  EQUITY_SFTP_OPERATION_TIMEOUT_MS,
  loadEquitySftpConfig,
  remoteFilePath,
  withTimeout,
  type EquitySftpConfig,
  type SftpClientLike,
} from './equitySftpService';
import { settleTransferredPayment } from './hierarchyService';

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

export type ResponseKind = 'ack' | 'nack' | 'psr';

type Row = Record<string, unknown>;
export type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

export type EquityResponseDeps = {
  createClient?: () => SftpClientLike;
  /** Plain (non-transactional) query. Defaults to the shared pool. */
  query?: QueryFn;
  /** Runs `fn` in one database transaction (BEGIN/COMMIT, ROLLBACK on error). */
  transaction?: <T>(fn: (q: QueryFn) => Promise<T>) => Promise<T>;
  audit?: typeof logAudit;
  env?: NodeJS.ProcessEnv;
  settle?: (paymentId: string, reference: string) => Promise<boolean>;
  decrypt?: (input: Buffer) => Promise<Buffer>;
};

/** Responses are small CSVs; refuse anything unreasonable rather than load it into memory. */
export const MAX_RESPONSE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1000;
const MAX_PORTAL_REASON_LENGTH = 300;

const KIND_ORDER: Record<ResponseKind, number> = { ack: 0, nack: 1, psr: 2 };

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

export type InboundResponseFile = {
  name: string;
  size: number;
  kind: ResponseKind;
  encrypted: boolean;
};

/** ACK_* / NACK_* / PSR_* with a .csv or .csv.pgp extension; anything else is ignored. */
export function classifyInboundFile(name: string): { kind: ResponseKind; encrypted: boolean } | null {
  if (!/\.csv(\.pgp)?$/i.test(name)) return null;
  const kind = detectEquityResponseKind(name);
  if (!kind) return null;
  return { kind, encrypted: /\.pgp$/i.test(name) };
}

/** `ACK__<stem>.csv.pgp` -> `<stem>` (the outbound file name without `.csv`). */
export function stemFromResponseFilename(name: string): string {
  return name
    .replace(/\.pgp$/i, '')
    .replace(/\.csv$/i, '')
    .replace(/^(NACK|ACK|PSR)_+/i, '');
}

// ---------------------------------------------------------------------------
// SQL (exported so tests can stub the database by statement)
// ---------------------------------------------------------------------------

export const STORED_FILENAMES_SQL = `SELECT filename FROM equity_response_files WHERE filename = ANY($1::text[])`;

/**
 * Batches whose outbound file name (without .csv) equals the stem, or that the stem ends with
 * after an underscore: Equity prefixes the stem with the customer ids
 * (`<id>_<id>_TMP224_...`) while our stored name starts at `TMP224_...`.
 */
export const FIND_BATCH_BY_STEM_SQL = `SELECT id, status, portal_batch_id, (stem = $1) AS exact
  FROM (SELECT id, status, to_jsonb(equity_payment_batches) ->> 'portal_batch_id' AS portal_batch_id,
               regexp_replace(filename, '\\.csv$', '', 'i') AS stem
          FROM equity_payment_batches) b
 WHERE stem = $1
    OR (char_length($1) > char_length(stem) AND right($1, char_length(stem) + 1) = '_' || stem)`;

export const FIND_BATCH_BY_FILE_REFERENCE_SQL = `SELECT id, status,
       to_jsonb(equity_payment_batches) ->> 'portal_batch_id' AS portal_batch_id, TRUE AS exact
  FROM equity_payment_batches WHERE file_reference = $1`;

export const INSERT_RESPONSE_FILE_SQL = `INSERT INTO equity_response_files
  (batch_id, kind, filename, content_sha256, raw_text, parse_summary)
VALUES ($1, $2, $3, $4, $5, $6::jsonb)
ON CONFLICT (content_sha256) DO NOTHING
RETURNING id`;

export const ACK_BATCH_SQL = `UPDATE equity_payment_batches
   SET status = CASE WHEN status IN ('generated', 'uploaded') THEN 'accepted' ELSE status END,
       ack_code = $2,
       file_reference = COALESCE(file_reference, $3),
       acked_at = NOW(),
       updated_at = NOW()
 WHERE id = $1`;

export const NACK_BATCH_SQL = `UPDATE equity_payment_batches
   SET status = CASE WHEN status IN ('generated', 'uploaded', 'accepted') THEN 'rejected' ELSE status END,
       nack_summary = $2,
       file_reference = COALESCE(file_reference, $3),
       nacked_at = NOW(),
       updated_at = NOW()
 WHERE id = $1`;

/** payment_line_id is read via to_jsonb so this also works before migration 020 is applied. */
export const SELECT_TX_SQL = `SELECT bt.id, bt.payment_id, bt.status::text AS status,
       to_jsonb(bt) ->> 'payment_line_id' AS payment_line_id
  FROM bank_transactions bt
 WHERE bt.batch_id = $1 AND bt.customer_reference = $2
 FOR UPDATE`;

/**
 * Open transactions of a PORTAL batch that a NACK did not name. A NACK rejects the whole file,
 * so none of them was paid. Only used for batches with a portal_batch_id.
 */
export const OPEN_PORTAL_TX_SQL = `SELECT id, payment_line_id, status::text AS status
  FROM bank_transactions
 WHERE batch_id = $1 AND payment_line_id IS NOT NULL AND status::text IN ('pending', 'processing')
 FOR UPDATE`;

/**
 * Lovable function: records the bank's verdict on a payment line that is at stage 'sent'.
 * Returns NULL (and does nothing) when the line is not at 'sent', so repeating it is harmless.
 * It runs on the file's own transaction connection: if the file rolls back, so does this.
 */
export const PL2_RECORD_RESULT_SQL = `SELECT pl2_system_record_result($1::uuid, $2::text, $3::text, $4::text) AS outcome`;

export const PORTAL_NACK_FALLBACK_REASON = 'File rejected by Equity';
export const PORTAL_PSR_FALLBACK_REASON = 'Payment failed at the bank';

export const FAIL_TX_SQL = `UPDATE bank_transactions
   SET status = 'failed',
       equity_error_code = $2,
       equity_error_description = $3,
       equity_transaction_id = COALESCE(NULLIF($4, ''), equity_transaction_id),
       equity_file_reference = COALESCE(NULLIF($5, ''), equity_file_reference)
 WHERE id = $1`;

export const COMPLETE_TX_SQL = `UPDATE bank_transactions
   SET status = 'completed',
       equity_transaction_id = $2,
       equity_file_reference = $3,
       equity_payment_type = $4,
       completed_at = NOW()
 WHERE id = $1`;

export const BATCH_TX_COUNTS_SQL = `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status::text = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status::text = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status::text IN ('pending', 'processing'))::int AS open
  FROM bank_transactions WHERE batch_id = $1`;

export const PSR_BATCH_SQL = `UPDATE equity_payment_batches
   SET status = COALESCE($2, status),
       file_reference = COALESCE(file_reference, NULLIF($3, '')),
       psr_received_at = NOW(),
       updated_at = NOW()
 WHERE id = $1`;

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export type EquityResponsePollCounts = {
  filesSeen: number;
  filesNew: number;
  filesProcessed: number;
  /** New files skipped because the same plaintext was already stored under another name. */
  duplicates: number;
  /** Payments completed from PSR rows. */
  success: number;
  /** Transactions failed from NACK lines and PSR 'Failed' rows. */
  failed: number;
  /** Rows (or files) left for a human: unknown status, conflicts, unexpected ACK status. */
  needsReview: number;
  /** Files with no matching batch, and rows with no matching transaction. */
  unmatched: number;
  /** Files that could not be downloaded, decrypted, parsed or applied (retried next poll). */
  errors: number;
};

export type EquityResponsePollResult =
  | { status: 'disabled' }
  | ({ status: 'ok' } & EquityResponsePollCounts);

function emptyCounts(): EquityResponsePollCounts {
  return {
    filesSeen: 0,
    filesNew: 0,
    filesProcessed: 0,
    duplicates: 0,
    success: 0,
    failed: 0,
    needsReview: 0,
    unmatched: 0,
    errors: 0,
  };
}

type FileEffect = Pick<
  EquityResponsePollCounts,
  'success' | 'failed' | 'needsReview' | 'unmatched'
> & { duplicate: boolean };

// ---------------------------------------------------------------------------
// Listing (also used by scripts/check-equity-responses.ts)
// ---------------------------------------------------------------------------

export function pickInboundResponseFiles(
  listing: ReadonlyArray<{ name: string; size: number; type?: string }>
): InboundResponseFile[] {
  const out: InboundResponseFile[] = [];
  for (const entry of listing) {
    if (entry.type === 'd' || entry.type === 'l') continue;
    const c = classifyInboundFile(entry.name);
    if (c) out.push({ name: entry.name, size: Number(entry.size), ...c });
  }
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
}

export async function findStoredFilenames(query: QueryFn, names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await query(STORED_FILENAMES_SQL, [names]);
  return new Set(rows.map((r) => String(r.filename)));
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

async function defaultTransaction<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(async (text, params) => (await client.query(text, params)).rows);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Applying one file
// ---------------------------------------------------------------------------

type BatchRef = { id: string; status: string; portalBatchId?: string | null };

async function findBatch(
  q: QueryFn,
  stem: string,
  fileReference: string
): Promise<BatchRef | null> {
  const pick = (rows: Row[]): BatchRef | null => {
    const exact = rows.filter((r) => r.exact === true);
    const chosen = exact.length === 1 ? exact[0] : exact.length === 0 && rows.length === 1 ? rows[0] : null;
    return chosen
      ? {
          id: String(chosen.id),
          status: String(chosen.status),
          portalBatchId: chosen.portal_batch_id ? String(chosen.portal_batch_id) : null,
        }
      : null;
  };

  if (stem) {
    const found = pick(await q(FIND_BATCH_BY_STEM_SQL, [stem]));
    if (found) return found;
  }
  if (fileReference) {
    return pick(await q(FIND_BATCH_BY_FILE_REFERENCE_SQL, [fileReference]));
  }
  return null;
}

function clip(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
}

const OPEN_TX = new Set(['pending', 'processing']);

const noEffect = (): FileEffect => ({
  success: 0,
  failed: 0,
  needsReview: 0,
  unmatched: 0,
  duplicate: false,
});

async function applyAck(q: QueryFn, batch: BatchRef, ack: EquityAckParseResult): Promise<FileEffect> {
  const effect = noEffect();
  if (ack.statusCode.trim().toUpperCase() !== 'ACPT') {
    // Not an acceptance we understand: store the file, change nothing, ask a human.
    effect.needsReview = 1;
    return effect;
  }
  await q(ACK_BATCH_SQL, [batch.id, ack.statusCode.trim(), ack.fileReference]);
  return effect;
}

/**
 * Tell the portal what the bank decided about a payment line. A null result (the line is not at
 * 'sent': already recorded, or never marked sent) is harmless and ignored. A thrown error
 * propagates so the whole file is rolled back and retried on the next poll.
 */
async function recordPortalResult(
  q: QueryFn,
  lineId: string,
  status: 'paid' | 'failed',
  reason: string | null,
  bankTransactionId: string | null
): Promise<void> {
  await q(PL2_RECORD_RESULT_SQL, [lineId, status, reason, bankTransactionId]);
}

/** Bank-supplied reason for the portal, bounded; a fallback when the bank gave none. */
function portalReason(text: string | undefined, fallback: string): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_PORTAL_REASON_LENGTH) : fallback;
}

async function applyNack(
  q: QueryFn,
  batch: BatchRef,
  nack: EquityNackParseResult
): Promise<FileEffect> {
  const effect = noEffect();
  await q(NACK_BATCH_SQL, [batch.id, clip(nack.summary.summaryMessage), nack.summary.fileReference]);

  for (const record of nack.records) {
    const rows = await q(SELECT_TX_SQL, [batch.id, record.customerReference]);
    const tx = rows[0];
    if (!tx) {
      effect.unmatched++;
      continue;
    }
    const status = String(tx.status);
    if (status === 'failed') continue; // same line twice, or already handled
    if (!OPEN_TX.has(status)) {
      effect.needsReview++; // e.g. already completed: the bank contradicts itself
      continue;
    }
    if (tx.payment_line_id) {
      await recordPortalResult(
        q,
        String(tx.payment_line_id),
        'failed',
        portalReason(record.errorDescription, PORTAL_NACK_FALLBACK_REASON),
        null
      );
    }
    await q(FAIL_TX_SQL, [
      tx.id,
      record.errorCode,
      clip(record.errorDescription),
      record.equityTransactionId,
      record.fileReference,
    ]);
    effect.failed++;
  }

  // Portal file: the NACK rejects the whole file, so lines it did not name were not paid either.
  if (batch.portalBatchId) {
    for (const open of await q(OPEN_PORTAL_TX_SQL, [batch.id])) {
      await recordPortalResult(
        q,
        String(open.payment_line_id),
        'failed',
        PORTAL_NACK_FALLBACK_REASON,
        null
      );
      await q(FAIL_TX_SQL, [
        open.id,
        nack.summary.statusCode,
        clip(nack.summary.summaryMessage),
        '',
        nack.summary.fileReference,
      ]);
      effect.failed++;
    }
  }

  // Lines the NACK did not mention stay open: surface them.
  const counts = (await q(BATCH_TX_COUNTS_SQL, [batch.id]))[0];
  effect.needsReview += Number(counts?.open ?? 0);
  return effect;
}

async function applyPsr(
  q: QueryFn,
  batch: BatchRef,
  psr: EquityPsrParseResult,
  settle: NonNullable<EquityResponseDeps['settle']>
): Promise<FileEffect> {
  const effect = noEffect();
  let fileReference = '';

  for (const record of psr.records) {
    fileReference = fileReference || record.fileReference;
    const rows = await q(SELECT_TX_SQL, [batch.id, record.customerReference]);
    const tx = rows[0];
    if (!tx) {
      effect.unmatched++;
      continue;
    }
    const status = String(tx.status);

    if (record.status === 'success') {
      if (status === 'completed') continue; // duplicate row or earlier PSR: already settled
      if (!OPEN_TX.has(status)) {
        effect.needsReview++; // was failed, now "Success": a human decides
        continue;
      }
      const reference = record.equityTransactionId || record.fileReference;
      await q(COMPLETE_TX_SQL, [tx.id, record.equityTransactionId, record.fileReference, record.paymentType]);
      if (tx.payment_line_id) {
        // Portal line: the portal settles it. settleTransferredPayment is for the payments table only.
        await recordPortalResult(
          q,
          String(tx.payment_line_id),
          'paid',
          null,
          record.equityTransactionId || null
        );
        effect.success++;
        continue;
      }
      // Idempotent. It runs on another connection, so if this file's transaction rolls back the
      // payment stays settled and the retry simply completes the transaction row. A thrown
      // error aborts (and rolls back) the whole file so it is retried on the next poll.
      const settled = await settle(String(tx.payment_id), reference);
      effect.success++;
      if (!settled) effect.needsReview++; // paid, but the payment row could not be settled
      continue;
    }

    if (record.status === 'failed') {
      if (status === 'failed') continue;
      if (!OPEN_TX.has(status)) {
        effect.needsReview++; // was completed, now "Failed": a human decides
        continue;
      }
      if (tx.payment_line_id) {
        await recordPortalResult(
          q,
          String(tx.payment_line_id),
          'failed',
          portalReason(record.errorDescription, PORTAL_PSR_FALLBACK_REASON),
          null
        );
      }
      await q(FAIL_TX_SQL, [
        tx.id,
        record.errorCode,
        clip(record.errorDescription),
        record.equityTransactionId,
        record.fileReference,
      ]);
      effect.failed++;
      continue;
    }

    // Any other status (including 'Verification Failure'): leave the row as it is.
    if (OPEN_TX.has(status)) effect.needsReview++;
  }

  // Batch status from the state of ALL its transactions after this file.
  const c = (await q(BATCH_TX_COUNTS_SQL, [batch.id]))[0] ?? {};
  const total = Number(c.total ?? 0);
  const completed = Number(c.completed ?? 0);
  const failed = Number(c.failed ?? 0);
  let next: string | null = null;
  if (total > 0 && completed === total) next = 'settled';
  else if (total > 0 && failed === total) next = 'failed';
  else if (completed > 0 || failed > 0) next = 'partially_settled';
  await q(PSR_BATCH_SQL, [batch.id, next, fileReference]);

  return effect;
}

function parseSummary(parsed: ReturnType<typeof parseEquityResponseFile>): Record<string, unknown> {
  if (parsed.kind === 'ack') return { kind: 'ack', statusCode: parsed.statusCode };
  if (parsed.kind === 'nack') {
    return { kind: 'nack', statusCode: parsed.summary.statusCode, records: parsed.records.length };
  }
  const byStatus: Record<string, number> = {};
  for (const r of parsed.records) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { kind: 'psr', records: parsed.records.length, byStatus };
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

async function processFile(
  client: SftpClientLike,
  config: EquitySftpConfig,
  file: InboundResponseFile,
  deps: Required<Pick<EquityResponseDeps, 'transaction' | 'settle' | 'decrypt'>>
): Promise<FileEffect> {
  if (file.size > MAX_RESPONSE_FILE_BYTES) {
    throw new Error(`file is larger than ${MAX_RESPONSE_FILE_BYTES} bytes; not downloaded`);
  }

  const remotePath = remoteFilePath(config.inboundDir, file.name);
  const downloaded = await withTimeout(client.get(remotePath), EQUITY_SFTP_OPERATION_TIMEOUT_MS, 'download');
  if (!Buffer.isBuffer(downloaded)) throw new Error('download did not return file contents');
  if (downloaded.length > MAX_RESPONSE_FILE_BYTES) {
    throw new Error(`file is larger than ${MAX_RESPONSE_FILE_BYTES} bytes`);
  }

  const plaintext = file.encrypted ? await deps.decrypt(downloaded) : downloaded;
  const sha256 = createHash('sha256').update(plaintext).digest('hex');
  const text = plaintext.toString('utf8').replace(/^\uFEFF/, '');
  const parsed = parseEquityResponseFile(file.name, text);

  const filenameStem = stemFromResponseFilename(file.name);
  const stem = parsed.kind === 'psr' ? filenameStem : parsed.kind === 'ack' ? parsed.outboundFilenameStem : parsed.summary.outboundFilenameStem;
  const fileReference =
    parsed.kind === 'ack'
      ? parsed.fileReference
      : parsed.kind === 'nack'
      ? parsed.summary.fileReference
      : parsed.records[0]?.fileReference ?? '';

  return deps.transaction(async (q) => {
    let batch = await findBatch(q, stem.trim(), '');
    if (!batch && stem.trim() !== filenameStem) batch = await findBatch(q, filenameStem, '');
    if (!batch) batch = await findBatch(q, '', fileReference.trim());

    const inserted = await q(INSERT_RESPONSE_FILE_SQL, [
      batch?.id ?? null,
      file.kind,
      file.name,
      sha256,
      text,
      JSON.stringify(parseSummary(parsed)),
    ]);
    if (inserted.length === 0) return { ...noEffect(), duplicate: true };

    if (!batch) {
      const effect = noEffect();
      // The file is stored (batch_id NULL) but nothing can be applied.
      effect.unmatched = parsed.kind === 'ack' ? 1 : Math.max(1, parsed.records.length);
      return effect;
    }

    if (parsed.kind === 'ack') return applyAck(q, batch, parsed);
    if (parsed.kind === 'nack') return applyNack(q, batch, parsed);
    return applyPsr(q, batch, parsed, deps.settle);
  });
}

/**
 * Poll Equity's inbound directory once and apply new ACK / NACK / PSR files.
 * Returns counts only. Not wired to any route or scheduler.
 */
export async function runEquityResponsePoll(
  params: { initiatedBy?: string | null } = {},
  deps: EquityResponseDeps = {}
): Promise<EquityResponsePollResult> {
  const env = deps.env ?? process.env;
  if (env.EQUITY_RESPONSE_POLL_ENABLED !== 'true') return { status: 'disabled' };

  const query: QueryFn = deps.query ?? ((text, p) => dbQuery(text, p));
  const run = {
    transaction: deps.transaction ?? defaultTransaction,
    settle: deps.settle ?? settleTransferredPayment,
    decrypt: deps.decrypt ?? decryptEquityResponse,
  };
  const audit = deps.audit ?? logAudit;
  const secret = env.EQUITY_SFTP_PASSWORD;

  const config = loadEquitySftpConfig(env);
  const counts = emptyCounts();

  // ONE connection attempt; a failure here throws and nothing else happens.
  const client = await connectEquitySftp(config, deps);
  try {
    const listing = await withTimeout(
      client.list(config.inboundDir),
      EQUITY_SFTP_OPERATION_TIMEOUT_MS,
      'list'
    );
    const inbound = pickInboundResponseFiles(listing);
    counts.filesSeen = inbound.length;

    const stored = await findStoredFilenames(query, inbound.map((f) => f.name));
    const fresh = inbound.filter((f) => !stored.has(f.name));
    counts.filesNew = fresh.length;

    for (const file of fresh) {
      try {
        const effect = await processFile(client, config, file, run);
        if (effect.duplicate) {
          counts.duplicates++;
          continue;
        }
        counts.filesProcessed++;
        counts.success += effect.success;
        counts.failed += effect.failed;
        counts.needsReview += effect.needsReview;
        counts.unmatched += effect.unmatched;
      } catch (err) {
        counts.errors++;
        // Name and reason only: never file contents. The file is retried on the next poll.
        console.error(
          `[equityResponseService] could not process ${file.name}: ${describeError(err, secret)}`
        );
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }

  if (counts.filesNew > 0) {
    try {
      await audit({
        userId: params.initiatedBy ?? undefined,
        action: 'banking.responses_processed',
        category: 'financial',
        resourceType: 'equity_response_file',
        details: { country: 'UG', ...counts },
        success: counts.errors === 0,
      });
    } catch (err) {
      console.error('[equityResponseService] audit log write failed:', describeError(err, secret));
    }
  }

  return { status: 'ok', ...counts };
}
