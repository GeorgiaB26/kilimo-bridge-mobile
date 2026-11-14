/**
 * Equity Bank (Uganda) SFTP upload.
 *
 * Uploads the PGP-encrypted batch files produced by `buildUgandaBatches` to Equity's outbound
 * directory and records the result in `equity_payment_batches` / `bank_transactions`.
 *
 * SAFETY:
 * - Not imported from any route or from index.ts, and there is no scheduler. It is only
 *   reachable from scripts until it has been reviewed.
 * - ONE connection attempt per call, never a retry: repeated failed logins can lock the
 *   Equity account.
 * - Payments are only released (batch 'failed') when it is CERTAIN the file did not reach the
 *   server. If that cannot be confirmed the batch is left in 'generated' with its transactions
 *   'pending' (so the next run excludes them) and reported as "uncertain".
 * - The SFTP password is never logged, returned or put in an error message or audit entry.
 *   Error text is passed through `describeError`, which also redacts the password.
 * - Files built from portal payment lines (bank_transactions.payment_line_id) are also recorded
 *   in the portal: after a CERTAIN upload the lines are marked sent (pl2_system_mark_lines_sent)
 *   and payment_batches.send_error is cleared; a certain failure or an uncertain outcome sets a
 *   short, non-sensitive send_error for the Banking Agent. The upload is never retried because a
 *   database call failed.
 * - Audit entries contain counts only (no phone numbers, names or file contents).
 */

import { createHash } from 'crypto';
import SftpClient from 'ssh2-sftp-client';
import { query as dbQuery } from '../db/database';
import { logAudit } from './auditService';
import {
  buildUgandaBatches,
  type BuiltUgandaBatch,
  type BuildUgandaBatchesResult,
} from './equityBatchService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EQUITY_SFTP_DEFAULT_PORT = 22;
export const EQUITY_SFTP_DEFAULT_OUTBOUND_DIR = '/upload/OUTBOUND';
export const EQUITY_SFTP_DEFAULT_INBOUND_DIR = '/upload/INBOUND';

/** Time allowed for TCP + SSH handshake + login (milliseconds). */
export const EQUITY_SFTP_READY_TIMEOUT_MS = 20_000;
/** Time allowed for a single remote operation (upload or stat), in milliseconds. */
export const EQUITY_SFTP_OPERATION_TIMEOUT_MS = 60_000;

const UPLOAD_FAILED_CODE = 'UPLOAD_FAILED';
/** Stored on a batch whose upload outcome could not be confirmed. */
export const EQUITY_UPLOAD_UNCERTAIN_MESSAGE =
  'UPLOAD_UNCERTAIN: check the Equity outbound and inbound folders before retrying';
const MAX_ERROR_MESSAGE_LENGTH = 500;
/** SHA-256 digest = 32 bytes = 43 unpadded base64 characters. */
const FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}=*$/;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type EquitySftpConfig = {
  host: string;
  port: number;
  username: string;
  /** Present for connecting only. Non-enumerable, so JSON.stringify / console.log never show it. */
  readonly password: string;
  /** Pinned server host key fingerprint, `SHA256:<unpadded base64>`. */
  hostKeySha256: string;
  outboundDir: string;
  inboundDir: string;
};

function normalizeRemoteDir(dir: string): string {
  const withSlash = dir.startsWith('/') ? dir : `/${dir}`;
  const stripped = withSlash.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

/**
 * Read the SFTP settings from the environment. Throws ONE error listing every missing or
 * invalid variable. The error never contains a value, only variable names.
 */
export function loadEquitySftpConfig(env: NodeJS.ProcessEnv = process.env): EquitySftpConfig {
  const trimmed = (name: string): string | undefined => env[name]?.trim() || undefined;

  const host = trimmed('EQUITY_SFTP_HOST');
  const username = trimmed('EQUITY_SFTP_USERNAME');
  const password = env.EQUITY_SFTP_PASSWORD; // not trimmed: whitespace could be part of it
  const hostKey = trimmed('EQUITY_SFTP_HOST_KEY_SHA256');
  const portRaw = trimmed('EQUITY_SFTP_PORT');

  const missing: string[] = [];
  if (!host) missing.push('EQUITY_SFTP_HOST');
  if (!username) missing.push('EQUITY_SFTP_USERNAME');
  if (!password) missing.push('EQUITY_SFTP_PASSWORD');
  if (!hostKey) missing.push('EQUITY_SFTP_HOST_KEY_SHA256');

  const invalid: string[] = [];
  let port = EQUITY_SFTP_DEFAULT_PORT;
  if (portRaw !== undefined) {
    const n = /^\d+$/.test(portRaw) ? Number(portRaw) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 65535) {
      port = n;
    } else {
      invalid.push('EQUITY_SFTP_PORT (must be a whole number from 1 to 65535)');
    }
  }
  if (hostKey && !FINGERPRINT_PATTERN.test(hostKey)) {
    invalid.push('EQUITY_SFTP_HOST_KEY_SHA256 (must look like SHA256:<43 base64 characters>)');
  }

  if (missing.length > 0 || invalid.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
    if (invalid.length > 0) parts.push(`invalid: ${invalid.join(', ')}`);
    throw new Error(`Invalid Equity SFTP configuration (${parts.join('; ')})`);
  }

  const config = {
    host: host!,
    port,
    username: username!,
    hostKeySha256: hostKey!.replace(/=+$/, ''),
    outboundDir: normalizeRemoteDir(
      trimmed('EQUITY_SFTP_OUTBOUND_DIR') ?? EQUITY_SFTP_DEFAULT_OUTBOUND_DIR
    ),
    inboundDir: normalizeRemoteDir(
      trimmed('EQUITY_SFTP_INBOUND_DIR') ?? EQUITY_SFTP_DEFAULT_INBOUND_DIR
    ),
  } as EquitySftpConfig;
  Object.defineProperty(config, 'password', { value: password!, enumerable: false });
  return config;
}

// ---------------------------------------------------------------------------
// Errors and secrets
// ---------------------------------------------------------------------------

/** Remove every occurrence of the secret from a piece of text. */
function redact(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}

/** Safe, bounded, single-line description of an error: password removed, length capped. */
export function describeError(err: unknown, password?: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
  const clean = redact(raw, password).replace(/\s+/g, ' ').trim() || 'unknown error';
  return clean.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${clean.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : clean;
}

// ---------------------------------------------------------------------------
// Client abstraction (the real ssh2-sftp-client satisfies this; tests pass a fake)
// ---------------------------------------------------------------------------

export type RemoteFileInfo = { name: string; size: number; type?: string };

export interface SftpClientLike {
  connect(options: Record<string, unknown>): Promise<unknown>;
  put(input: Buffer, remotePath: string): Promise<unknown>;
  stat(remotePath: string): Promise<{ size: number }>;
  list(remotePath: string): Promise<RemoteFileInfo[]>;
  /** Download a remote file into memory. */
  get(remotePath: string): Promise<unknown>;
  delete(remotePath: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export type EquitySftpDeps = {
  createClient?: () => SftpClientLike;
  /** Runs SQL and resolves to the rows. Defaults to the shared pool. */
  query?: (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  audit?: typeof logAudit;
  env?: NodeJS.ProcessEnv;
  build?: typeof buildUgandaBatches;
};

function defaultCreateClient(): SftpClientLike {
  return new SftpClient() as unknown as SftpClientLike;
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

/** OpenSSH-style fingerprint of a raw host key: `SHA256:<unpadded base64>`. */
export function hostKeyFingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

/** True only when the presented key matches the pinned fingerprint exactly. */
export function hostKeyMatches(key: Buffer, expectedFingerprint: string): boolean {
  return hostKeyFingerprint(key) === expectedFingerprint.replace(/=+$/, '');
}

/**
 * Open the SFTP connection with password authentication (also answering keyboard-interactive
 * prompts with the password) and a pinned host key.
 *
 * Exactly ONE attempt: ssh2-sftp-client does not retry and neither do we. On any failure the
 * client is closed and a clear, password-free error is thrown.
 */
export async function connectEquitySftp(
  config: EquitySftpConfig,
  deps: Pick<EquitySftpDeps, 'createClient'> = {}
): Promise<SftpClientLike> {
  const client = (deps.createClient ?? defaultCreateClient)();

  let presentedFingerprint: string | null = null;
  let hostKeyRejected = false;

  client.on(
    'keyboard-interactive',
    (
      _name: string,
      _instructions: string,
      _lang: string,
      prompts: unknown[],
      finish: (answers: string[]) => void
    ) => {
      finish(prompts.map(() => config.password));
    }
  );

  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      tryKeyboard: true,
      readyTimeout: EQUITY_SFTP_READY_TIMEOUT_MS,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
      // No hostHash: ssh2 then passes the raw key, which we fingerprint the OpenSSH way.
      hostVerifier: (key: Buffer): boolean => {
        presentedFingerprint = hostKeyFingerprint(key);
        const ok = hostKeyMatches(key, config.hostKeySha256);
        if (!ok) hostKeyRejected = true;
        return ok;
      },
    });
  } catch (err) {
    await client.end().catch(() => undefined);
    if (hostKeyRejected) {
      throw new Error(
        `SFTP host key verification failed: the server presented ${presentedFingerprint} which does not match EQUITY_SFTP_HOST_KEY_SHA256. No login was attempted.`
      );
    }
    throw new Error(`SFTP connection failed: ${describeError(err, config.password)}`);
  }
  return client;
}

// ---------------------------------------------------------------------------
// Upload one file
// ---------------------------------------------------------------------------

/** A remote operation did not answer in time; it may still complete on the server. */
export class OperationTimeoutError extends Error {
  constructor(readonly operation: string, ms: number) {
    super(`${operation} timed out after ${ms / 1000}s`);
    this.name = 'OperationTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(what, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function remoteFilePath(dir: string, filename: string): string {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    throw new Error('Invalid batch file name');
  }
  return `${dir === '/' ? '' : dir}/${filename}`;
}

type RemoteFileState =
  | { state: 'ok' }
  | { state: 'absent' }
  | { state: 'wrong_size'; size: number };

/**
 * Look at the remote file. Resolves 'absent' ONLY when the server answers "no such file".
 * Throws when it cannot be checked (connection lost, timeout, permission error, ...), which
 * the caller must treat as an uncertain outcome.
 */
async function checkRemoteFile(
  client: SftpClientLike,
  remotePath: string,
  expectedSize: number
): Promise<RemoteFileState> {
  try {
    const st = await withTimeout(client.stat(remotePath), EQUITY_SFTP_OPERATION_TIMEOUT_MS, 'stat');
    const size = Number(st.size);
    return size === expectedSize ? { state: 'ok' } : { state: 'wrong_size', size };
  } catch (err) {
    if (isNoSuchFile(err)) return { state: 'absent' };
    throw err;
  }
}

function isNoSuchFile(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return (
    !!e &&
    (e.code === 2 ||
      e.code === 'ENOENT' ||
      (typeof e.message === 'string' && /no such file|not exist/i.test(e.message)))
  );
}

/**
 * Upload one file to the outbound directory under its final name, then stat it and check the
 * size equals the content length. Equity collects files every minute and the file is small, so
 * there is no temporary name or rename. Throws on any failure.
 */
export async function uploadBatchFile(
  client: SftpClientLike,
  file: { filename: string; content: string },
  outboundDir: string = EQUITY_SFTP_DEFAULT_OUTBOUND_DIR
): Promise<void> {
  const remotePath = remoteFilePath(outboundDir, file.filename);
  const data = Buffer.from(file.content, 'utf8');

  await withTimeout(client.put(data, remotePath), EQUITY_SFTP_OPERATION_TIMEOUT_MS, 'upload');

  const st = await withTimeout(client.stat(remotePath), EQUITY_SFTP_OPERATION_TIMEOUT_MS, 'stat');
  if (Number(st.size) !== data.length) {
    throw new Error(
      `Uploaded file size mismatch: remote ${Number(st.size)} bytes, expected ${data.length} bytes`
    );
  }
}

// ---------------------------------------------------------------------------
// Recording results
// ---------------------------------------------------------------------------

/**
 * One statement per batch (a data-modifying CTE), so the batch row and its transactions change
 * together or not at all. Only rows still in the expected state are touched.
 */
export const MARK_BATCH_UPLOADED_SQL = `WITH ub AS (
  UPDATE equity_payment_batches
     SET status = 'uploaded', uploaded_at = NOW(), error_message = NULL, updated_at = NOW()
   WHERE id = $1 AND status = 'generated'
  RETURNING id
), ut AS (
  UPDATE bank_transactions
     SET status = 'processing'
   WHERE batch_id = $1 AND status::text = 'pending'
     AND EXISTS (SELECT 1 FROM ub)
  RETURNING id
)
SELECT (SELECT COUNT(*) FROM ub)::int AS batch_rows, (SELECT COUNT(*) FROM ut)::int AS tx_rows`;

export const MARK_BATCH_FAILED_SQL = `WITH fb AS (
  UPDATE equity_payment_batches
     SET status = 'failed', error_message = $2, updated_at = NOW()
   WHERE id = $1 AND status = 'generated'
  RETURNING id
), ft AS (
  UPDATE bank_transactions
     SET status = 'failed', equity_error_code = '${UPLOAD_FAILED_CODE}'
   WHERE batch_id = $1 AND status::text = 'pending'
     AND EXISTS (SELECT 1 FROM fb)
  RETURNING id
)
SELECT (SELECT COUNT(*) FROM fb)::int AS batch_rows, (SELECT COUNT(*) FROM ft)::int AS tx_rows`;

/** Leaves status 'generated' and the transactions 'pending' on purpose (see header). */
export const MARK_BATCH_UNCERTAIN_SQL = `UPDATE equity_payment_batches
   SET error_message = $2, updated_at = NOW()
 WHERE id = $1 AND status = 'generated'`;

type CountRow = { batch_rows?: number | string; tx_rows?: number | string };

// ---------------------------------------------------------------------------
// Portal payment lines (bank_transactions.payment_line_id)
//
// A file built from portal payment lines carries equity_payment_batches.portal_batch_id. The
// statements below are used ONLY for such files; files built from the payments table keep using
// the statements above, unchanged.
// ---------------------------------------------------------------------------

/**
 * Shown to the Banking Agent (payment_batches.send_error). Short, no host, path, credentials,
 * file name or numbers. The detailed (still password-free) reason stays in
 * equity_payment_batches.error_message.
 */
export const PORTAL_SEND_ERROR_UPLOAD_FAILED =
  'Upload to the bank failed. The lines will be sent again in the next cycle.';
export const PORTAL_SEND_ERROR_UPLOAD_UNCERTAIN =
  'Upload status unclear. Check the Equity folders before retrying.';

/**
 * Which source a file was built from. The columns are read through to_jsonb() so this also works
 * (and reports "payments path") on a database where migration 020 has not been applied.
 */
export const PORTAL_BATCH_LINES_SQL = `SELECT bt.id,
       to_jsonb(bt) ->> 'payment_line_id' AS payment_line_id,
       to_jsonb(eb) ->> 'portal_batch_id' AS portal_batch_id
  FROM bank_transactions bt
  JOIN equity_payment_batches eb ON eb.id = bt.batch_id
 WHERE bt.batch_id = $1`;

/** Lovable function: lines payment_approved -> sent, batch approved -> sent. Safe to repeat. */
export const PL2_MARK_LINES_SENT_SQL = `SELECT pl2_system_mark_lines_sent($1::uuid, $2::uuid[], $3::text) AS marked`;

/** MARK_BATCH_UPLOADED_SQL plus: clear payment_batches.send_error ($2 = portal batch id). */
export const MARK_PORTAL_BATCH_UPLOADED_SQL = `WITH ub AS (
  UPDATE equity_payment_batches
     SET status = 'uploaded', uploaded_at = NOW(), error_message = NULL, updated_at = NOW()
   WHERE id = $1 AND status = 'generated'
  RETURNING id
), ut AS (
  UPDATE bank_transactions
     SET status = 'processing'
   WHERE batch_id = $1 AND status::text = 'pending'
     AND EXISTS (SELECT 1 FROM ub)
  RETURNING id
), se AS (
  UPDATE payment_batches
     SET send_error = NULL
   WHERE id = $2::uuid
     AND EXISTS (SELECT 1 FROM ub)
  RETURNING id
)
SELECT (SELECT COUNT(*) FROM ub)::int AS batch_rows, (SELECT COUNT(*) FROM ut)::int AS tx_rows`;

/** MARK_BATCH_FAILED_SQL plus: set payment_batches.send_error ($3, portal batch id $4). */
export const MARK_PORTAL_BATCH_FAILED_SQL = `WITH fb AS (
  UPDATE equity_payment_batches
     SET status = 'failed', error_message = $2, updated_at = NOW()
   WHERE id = $1 AND status = 'generated'
  RETURNING id
), ft AS (
  UPDATE bank_transactions
     SET status = 'failed', equity_error_code = '${UPLOAD_FAILED_CODE}'
   WHERE batch_id = $1 AND status::text = 'pending'
     AND EXISTS (SELECT 1 FROM fb)
  RETURNING id
), se AS (
  UPDATE payment_batches
     SET send_error = $3::text
   WHERE id = $4::uuid
     AND EXISTS (SELECT 1 FROM fb)
  RETURNING id
)
SELECT (SELECT COUNT(*) FROM fb)::int AS batch_rows, (SELECT COUNT(*) FROM ft)::int AS tx_rows`;

/** MARK_BATCH_UNCERTAIN_SQL plus: set payment_batches.send_error ($3, portal batch id $4). */
export const MARK_PORTAL_BATCH_UNCERTAIN_SQL = `WITH ub AS (
  UPDATE equity_payment_batches
     SET error_message = $2, updated_at = NOW()
   WHERE id = $1 AND status = 'generated'
  RETURNING id
)
UPDATE payment_batches
   SET send_error = $3::text
 WHERE id = $4::uuid
   AND EXISTS (SELECT 1 FROM ub)`;

type PortalInfo = { portalBatchId: string; lineIds: string[] };

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type SentBatchResult = {
  batchId: string | null;
  filename: string;
  rowCount: number;
  totalAmount: number;
  status: 'uploaded' | 'failed' | 'uncertain';
  /**
   * False when the database could not be updated to match `status` (for an uploaded file this
   * needs manual reconciliation; the batch is NOT marked failed, to avoid a duplicate payment).
   */
  recorded: boolean;
  /** Password-free reason, for failed batches or unrecorded results. */
  error?: string;
};

export type SendBuiltBatchesResult = {
  results: SentBatchResult[];
  uploaded: number;
  failed: number;
  /** Upload outcome could not be confirmed; payments stay held. Needs a manual check. */
  uncertain: number;
  /** Results whose database update did not happen. Normally 0. */
  unrecorded: number;
  uploadedRows: number;
  failedRows: number;
};

type Entry = {
  batch: BuiltUgandaBatch;
  result: SentBatchResult | null;
  /**
   * Source of the file, read once: undefined = not looked up yet, null = payments table,
   * 'unknown' = the lookup failed or was inconsistent, otherwise the portal lines.
   */
  portal?: PortalInfo | null | 'unknown';
};

function summarize(results: SentBatchResult[]): SendBuiltBatchesResult {
  const uploaded = results.filter((r) => r.status === 'uploaded');
  const failed = results.filter((r) => r.status === 'failed');
  return {
    results,
    uploaded: uploaded.length,
    failed: failed.length,
    uncertain: results.filter((r) => r.status === 'uncertain').length,
    unrecorded: results.filter((r) => !r.recorded).length,
    uploadedRows: uploaded.reduce((n, r) => n + r.rowCount, 0),
    failedRows: failed.reduce((n, r) => n + r.rowCount, 0),
  };
}

/**
 * Upload built batches over ONE connection, one file after another, recording each result.
 *
 * - success: batch 'uploaded' (uploaded_at = NOW()), its bank_transactions 'processing'.
 * - upload error: the remote file is checked first.
 *     right size       => success.
 *     file absent      => certain it did not arrive: batch 'failed' + error_message,
 *                         bank_transactions 'failed' with equity_error_code 'UPLOAD_FAILED'
 *                         (payments can be selected again).
 *     wrong size       => best-effort delete of the partial file, then failed as above (a
 *                         failed delete is added to error_message).
 *     cannot be checked (connection lost, timeout, ...) or the upload itself timed out
 *                      => UNCERTAIN: the batch stays 'generated' and its transactions stay
 *                         'pending', so the next run excludes them. Only error_message is set
 *                         (EQUITY_UPLOAD_UNCERTAIN_MESSAGE). The run stops.
 * - connection/login failure before any upload, or batches never attempted because the run
 *   stopped early: 'failed' as above (nothing was sent, so the payments are released).
 *
 * Exception: if a file WAS uploaded but the database update fails, the batch is not marked
 * failed (that would let the payments be paid twice). It is reported with recorded=false and
 * the run stops.
 */
export async function sendBuiltBatches(
  batches: readonly BuiltUgandaBatch[],
  deps: EquitySftpDeps = {}
): Promise<SendBuiltBatchesResult> {
  const run = deps.query ?? ((text, params) => dbQuery(text, params));
  const env = deps.env ?? process.env;
  const secret = env.EQUITY_SFTP_PASSWORD;

  const entries: Entry[] = batches.map((batch) => ({ batch, result: null }));
  if (entries.length === 0) return summarize([]);

  const base = (e: Entry) => ({
    batchId: e.batch.batchId,
    filename: e.batch.filename,
    rowCount: e.batch.rowCount,
    totalAmount: e.batch.totalAmount,
  });

  /**
   * Decide (once per file) whether it was built from portal payment lines. A file is portal
   * only when ALL its bank_transactions have payment_line_id and share one portal batch id.
   */
  async function portalOf(e: Entry): Promise<PortalInfo | null | 'unknown'> {
    if (e.portal !== undefined) return e.portal;
    if (!e.batch.batchId) return (e.portal = null);
    try {
      const rows = (await run(PORTAL_BATCH_LINES_SQL, [e.batch.batchId])) ?? [];
      const lineRows = rows.filter((r) => r.payment_line_id);
      if (lineRows.length === 0) return (e.portal = null);
      const portalBatchIds = new Set(lineRows.map((r) => String(r.portal_batch_id ?? '')));
      if (lineRows.length !== rows.length || portalBatchIds.size !== 1 || portalBatchIds.has('')) {
        throw new Error('bank transactions of this file do not agree on their portal source');
      }
      return (e.portal = {
        portalBatchId: [...portalBatchIds][0],
        lineIds: [...new Set(lineRows.map((r) => String(r.payment_line_id)))],
      });
    } catch (err) {
      console.error(
        `[equitySftpService] could not read the payment lines of batch ${e.batch.batchId}: ${describeError(err, secret)}`
      );
      return (e.portal = 'unknown');
    }
  }

  /** Certain the file is not on the server: release the payments. */
  async function markFailed(e: Entry, reason: string): Promise<void> {
    const message = describeError(reason, secret);
    let recorded = false;
    let dbError: string | undefined;
    if (e.batch.batchId) {
      try {
        const portal = await portalOf(e);
        if (portal && portal !== 'unknown') {
          await run(MARK_PORTAL_BATCH_FAILED_SQL, [
            e.batch.batchId,
            message,
            PORTAL_SEND_ERROR_UPLOAD_FAILED,
            portal.portalBatchId,
          ]);
        } else {
          await run(MARK_BATCH_FAILED_SQL, [e.batch.batchId, message]);
        }
        recorded = true;
      } catch (err) {
        dbError = describeError(err, secret);
      }
    } else {
      dbError = 'no batch id';
    }
    e.result = {
      ...base(e),
      status: 'failed',
      recorded,
      error: dbError ? `${message} (database not updated: ${dbError})` : message,
    };
  }

  /** Outcome unknown: hold the payments (batch stays generated, transactions stay pending). */
  async function markUncertain(e: Entry, detail: string): Promise<void> {
    let recorded = false;
    let dbError: string | undefined;
    if (e.batch.batchId) {
      try {
        const portal = await portalOf(e);
        if (portal && portal !== 'unknown') {
          await run(MARK_PORTAL_BATCH_UNCERTAIN_SQL, [
            e.batch.batchId,
            EQUITY_UPLOAD_UNCERTAIN_MESSAGE,
            PORTAL_SEND_ERROR_UPLOAD_UNCERTAIN,
            portal.portalBatchId,
          ]);
        } else {
          await run(MARK_BATCH_UNCERTAIN_SQL, [e.batch.batchId, EQUITY_UPLOAD_UNCERTAIN_MESSAGE]);
        }
        recorded = true;
      } catch (err) {
        dbError = describeError(err, secret);
      }
    } else {
      dbError = 'no batch id';
    }
    e.result = {
      ...base(e),
      status: 'uncertain',
      recorded,
      error: `${EQUITY_UPLOAD_UNCERTAIN_MESSAGE} (${describeError(detail, secret)})${
        dbError ? ` (database not updated: ${dbError})` : ''
      }`,
    };
  }

  /**
   * The file is on the server. NEVER retry the upload, whatever happens here. For a portal file
   * the Lovable function marks the lines sent first (safe to repeat); then the batch and its
   * bank transactions are updated and send_error is cleared in one statement.
   */
  async function markUploaded(e: Entry): Promise<boolean> {
    try {
      const portal = await portalOf(e);
      if (portal === 'unknown') {
        throw new Error('the payment lines of this file could not be determined');
      }
      if (portal) {
        try {
          await run(PL2_MARK_LINES_SENT_SQL, [portal.portalBatchId, portal.lineIds, e.batch.filename]);
        } catch (err) {
          // The money is on its way but the portal does not know. Needs a human.
          console.error(
            `[equitySftpService] CRITICAL: batch ${e.batch.batchId} was UPLOADED to Equity but marking its ${portal.lineIds.length} payment line(s) as sent failed: ${describeError(err, secret)}. Do not re-upload. Reconcile manually.`
          );
          throw err;
        }
      }
      const rows = (await run(
        portal ? MARK_PORTAL_BATCH_UPLOADED_SQL : MARK_BATCH_UPLOADED_SQL,
        portal ? [e.batch.batchId, portal.portalBatchId] : [e.batch.batchId]
      )) as CountRow[];
      if (Number(rows[0]?.batch_rows ?? 0) !== 1) {
        e.result = {
          ...base(e),
          status: 'uploaded',
          recorded: false,
          error: 'File uploaded, but the batch was no longer in status generated',
        };
        return false;
      }
      e.result = { ...base(e), status: 'uploaded', recorded: true };
      return true;
    } catch (err) {
      e.result = {
        ...base(e),
        status: 'uploaded',
        recorded: false,
        error: `File uploaded, but the database update failed: ${describeError(err, secret)}`,
      };
      return false;
    }
  }

  let config: EquitySftpConfig | null = null;
  let client: SftpClientLike | null = null;
  let stopReason: string | null = null;
  /** The batch whose upload has started and has no recorded outcome yet. */
  let inFlight: Entry | null = null;

  try {
    config = loadEquitySftpConfig(env);
    client = await connectEquitySftp(config, deps);

    for (const entry of entries) {
      const { batch } = entry;

      if (!batch.batchId || !batch.encrypted) {
        await markFailed(entry, 'Batch has no id or no encrypted content to upload');
        continue;
      }

      let remotePath: string;
      try {
        remotePath = remoteFilePath(config.outboundDir, batch.filename);
      } catch (err) {
        await markFailed(entry, `Not uploaded: ${describeError(err, secret)}`);
        continue;
      }

      // Read-only. If we cannot tell where the file came from we must not upload it: we could
      // not record the outcome correctly afterwards.
      if ((await portalOf(entry)) === 'unknown') {
        await markFailed(entry, 'Not uploaded: the source of this batch could not be determined');
        continue;
      }

      const content = batch.encrypted;
      const size = Buffer.byteLength(content, 'utf8');
      let uploaded = false;
      let failure: string | null = null;
      let uncertain: string | null = null;

      inFlight = entry;
      try {
        await uploadBatchFile(client, { filename: batch.filename, content }, config.outboundDir);
        uploaded = true;
      } catch (err) {
        const uploadError = describeError(err, secret);
        if (err instanceof OperationTimeoutError && err.operation === 'upload') {
          // The write may still complete on the server later.
          uncertain = `${uploadError}; the file may still arrive`;
        } else {
          // Before judging, look at the server: it may have the whole file, none, or part.
          try {
            const remote = await checkRemoteFile(client, remotePath, size);
            if (remote.state === 'ok') {
              uploaded = true;
            } else if (remote.state === 'absent') {
              failure = `Upload failed: ${uploadError}`;
            } else {
              failure = `Upload failed: ${uploadError}; remote file has ${remote.size} bytes, expected ${size}`;
              try {
                await withTimeout(
                  client.delete(remotePath),
                  EQUITY_SFTP_OPERATION_TIMEOUT_MS,
                  'delete'
                );
                failure += '; the partial remote file was deleted';
              } catch (delErr) {
                failure += `; deleting the partial remote file also failed: ${describeError(delErr, secret)}`;
              }
            }
          } catch (checkErr) {
            uncertain = `${uploadError}; the remote file could not be checked: ${describeError(checkErr, secret)}`;
          }
        }
      }

      if (uncertain !== null) {
        await markUncertain(entry, uncertain);
        inFlight = null;
        stopReason = 'Run stopped after an upload with an uncertain outcome';
        break;
      }
      if (!uploaded) {
        await markFailed(entry, failure ?? 'Upload failed');
        inFlight = null;
        continue;
      }

      const recorded = await markUploaded(entry);
      inFlight = null;
      if (!recorded) {
        stopReason = 'Run stopped: the database could not record an uploaded file';
        break;
      }
    }
  } catch (err) {
    stopReason = describeError(err, secret);
    // An unexpected error while an upload was in progress: we do not know what arrived.
    if (inFlight && (inFlight as Entry).result === null) {
      await markUncertain(inFlight, stopReason);
    }
  } finally {
    if (client) await client.end().catch(() => undefined);
    // Never attempted (or failed before any upload): nothing was sent, so release them.
    const reason = `Not uploaded: ${stopReason ?? 'run stopped before this batch was attempted'}`;
    for (const entry of entries) {
      if (entry.result === null) await markFailed(entry, reason);
    }
  }

  return summarize(entries.map((e) => e.result as SentBatchResult));
}

// ---------------------------------------------------------------------------
// Cycle (build + send)
// ---------------------------------------------------------------------------

export type EquityBatchCycleSummary = {
  batches: number;
  rows: number;
  totalAmount: number;
  uploaded: number;
  failed: number;
  /** Batches whose upload outcome could not be confirmed (payments held, manual check). */
  uncertain: number;
  /** Payments the builder skipped (invalid mobile, network, amount or name). */
  skipped: number;
  /** Payments the builder left for a later run because of the caps. */
  deferred: number;
};

export type EquityBatchCycleResult =
  | { status: 'disabled' }
  | { status: 'locked' }
  | ({ status: 'dry_run' } & EquityBatchCycleSummary)
  | ({ status: 'ok'; unrecorded: number } & EquityBatchCycleSummary);

/**
 * Build the Uganda batches and upload them. Refuses unless EQUITY_AUTO_SEND_ENABLED is exactly
 * 'true'. A dry run is always allowed, writes nothing and never connects to SFTP.
 * Returns counts only. Not wired to any route or scheduler.
 */
export async function runEquityBatchCycle(
  params: { dryRun: boolean; initiatedBy?: string | null },
  deps: EquitySftpDeps = {}
): Promise<EquityBatchCycleResult> {
  const env = deps.env ?? process.env;
  const build = deps.build ?? buildUgandaBatches;
  const audit = deps.audit ?? logAudit;
  const initiatedBy = params.initiatedBy ?? null;

  if (params.dryRun) {
    const built = await build({ dryRun: true, initiatedBy });
    if (built.status === 'locked') return { status: 'locked' };
    return {
      status: 'dry_run',
      ...cycleSummary(built, { uploaded: 0, failed: 0, uncertain: 0 }),
    };
  }

  if (env.EQUITY_AUTO_SEND_ENABLED !== 'true') return { status: 'disabled' };

  // Fail before creating any batch if we could not upload it afterwards.
  loadEquitySftpConfig(env);

  const built = await build({ dryRun: false, initiatedBy });
  if (built.status === 'locked') return { status: 'locked' };

  const sent = await sendBuiltBatches(built.batches, deps);
  const summary = cycleSummary(built, sent);

  if (built.batches.length > 0) {
    try {
      await audit({
        userId: initiatedBy ?? undefined,
        action: 'banking.batch_sent',
        category: 'financial',
        resourceType: 'equity_payment_batch',
        details: { country: 'UG', ...summary, unrecorded: sent.unrecorded },
        success: sent.failed === 0 && sent.uncertain === 0 && sent.unrecorded === 0,
      });
    } catch (err) {
      console.error(
        '[equitySftpService] audit log write failed:',
        describeError(err, env.EQUITY_SFTP_PASSWORD)
      );
    }
  }

  return { status: 'ok', unrecorded: sent.unrecorded, ...summary };
}

function cycleSummary(
  built: Extract<BuildUgandaBatchesResult, { status: 'ok' }>,
  sent: { uploaded: number; failed: number; uncertain: number }
): EquityBatchCycleSummary {
  return {
    batches: built.batches.length,
    rows: built.batches.reduce((n, b) => n + b.rowCount, 0),
    totalAmount: built.totalAmount,
    uploaded: sent.uploaded,
    failed: sent.failed,
    uncertain: sent.uncertain,
    skipped: built.skippedCount,
    deferred: built.deferredCount,
  };
}
