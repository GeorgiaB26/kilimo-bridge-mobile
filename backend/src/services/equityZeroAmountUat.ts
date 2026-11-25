/**
 * Guards and helpers for the ONE-OFF Equity UAT negative test: a single Uganda wallet row with
 * Payment Amount 0, which Equity must reject with a NACK ("Amount should be greater than zero").
 *
 * The portal cannot create an amount-0 line, and the normal release path must never send one.
 * The only way to get a 0 row into a file is the parameter-only seam
 * `zeroAmountOverride: { onlyLineId, forceAmount: 0 }` on planUgandaBatches /
 * buildUgandaPortalBatches (equityBatchService.ts). This module holds the refusals that make
 * that seam safe. Everything here is pure or read-only; nothing here writes or connects.
 *
 * NOTHING in the scheduler, the SFTP cycle functions, any route or index.ts may import this
 * module or pass the seam (a test scans the source to prove it). The only caller is
 * scripts/send-equity-zero-amount-uat.ts.
 *
 * Refusals are thrown as ZeroAmountUatRefusal, before any database write or SFTP connection.
 * Messages name variables and facts but never print secrets, full phone numbers or account numbers.
 */
import { decryptField } from './encryptionService';
import { getUgandaServiceProvider, normalizeUgandaMobile } from './equityCountryConfig';

/** The line id the operator is allowed to send; must equal the id passed to the script. */
export const ZERO_AMOUNT_UAT_LINE_ID_ENV = 'ZERO_AMOUNT_UAT_LINE_ID';
/** Equity UAT SFTP host. Any other host (including Equity production) is refused. */
export const EQUITY_UAT_SFTP_HOST = '196.216.242.36';
/** The only wallet the test row may go to. */
export const ZERO_AMOUNT_UAT_WALLET = '0751000000';
export const ZERO_AMOUNT_UAT_SERVICE_PROVIDER = 'AIRTELMONEY-UG';
/** The only stage a line may be at when the row is built. */
export const ZERO_AMOUNT_UAT_REQUIRED_STAGE = 'payment_approved';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ZeroAmountUatRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZeroAmountUatRefusal';
  }
}

/** The seam. The amount can only ever be 0, and only for the one line named here. */
export type ZeroAmountOverride = { onlyLineId: string; forceAmount: 0 };

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

/** Last 3 digits only. Safe for messages and logs. */
export function maskDigits(value: unknown): string {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (digits.length <= 3) return '*'.repeat(Math.max(digits.length, 3));
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

/** Runtime check of the seam's shape: one line id, amount exactly 0. */
export function assertValidZeroAmountOverride(value: unknown): asserts value is ZeroAmountOverride {
  const o = value as { onlyLineId?: unknown; forceAmount?: unknown } | null;
  if (!o || typeof o !== 'object') {
    throw new ZeroAmountUatRefusal('zeroAmountOverride must be an object');
  }
  if (!isUuid(o.onlyLineId)) {
    throw new ZeroAmountUatRefusal('zeroAmountOverride.onlyLineId must be one payment line id (uuid)');
  }
  if (o.forceAmount !== 0) {
    throw new ZeroAmountUatRefusal('zeroAmountOverride.forceAmount must be exactly 0');
  }
}

/** The configured SFTP host must be Equity UAT. Production and unknown hosts are refused. */
export function assertEquityUatHost(env: NodeJS.ProcessEnv): void {
  const host = env.EQUITY_SFTP_HOST?.trim();
  if (host !== EQUITY_UAT_SFTP_HOST) {
    throw new ZeroAmountUatRefusal(
      'Refused: EQUITY_SFTP_HOST is not the Equity UAT host. This tool only runs against UAT; the production host and any other host are refused.'
    );
  }
}

/**
 * Env refusals shared by the seam and the script: the line id must equal ZERO_AMOUNT_UAT_LINE_ID
 * (so a leftover or copied command cannot send a different line) and the host must be UAT.
 */
export function assertZeroAmountUatEnv(lineId: string, env: NodeJS.ProcessEnv): void {
  if (!isUuid(lineId)) {
    throw new ZeroAmountUatRefusal('Refused: the payment line id must be a uuid');
  }
  const token = env[ZERO_AMOUNT_UAT_LINE_ID_ENV]?.trim();
  if (!token) {
    throw new ZeroAmountUatRefusal(`Refused: ${ZERO_AMOUNT_UAT_LINE_ID_ENV} is not set`);
  }
  if (token.toLowerCase() !== lineId.trim().toLowerCase()) {
    throw new ZeroAmountUatRefusal(
      `Refused: the line id does not equal ${ZERO_AMOUNT_UAT_LINE_ID_ENV}`
    );
  }
  assertEquityUatHost(env);
}

/**
 * Before sending (not before a dry run): the scheduler's send and poll jobs must be off in this
 * environment, because Equity allows one SFTP login at a time.
 */
export function assertSchedulerFlagsOff(env: NodeJS.ProcessEnv): void {
  const on = ['EQUITY_AUTO_SEND_ENABLED', 'EQUITY_RESPONSE_POLL_ENABLED'].filter(
    (name) => env[name] === 'true'
  );
  if (on.length > 0) {
    throw new ZeroAmountUatRefusal(
      `Refused: ${on.join(' and ')} must be turned off (and the service restarted) before this runs`
    );
  }
}

/** What the guards need to know about the target line. */
export type ZeroAmountUatLineFacts = {
  stage: string | null;
  holdKind: string | null;
  bankReference: string | null;
  lineCurrency: string | null;
  batchCurrency: string | null;
  batchCountry: string | null;
  /** Raw farmer mobile. Never printed. */
  farmerPhone: string | null;
};

function checkWallet(phone: string | null | undefined): string | null {
  try {
    const normalized = normalizeUgandaMobile(phone ?? '');
    if (normalized !== ZERO_AMOUNT_UAT_WALLET) {
      return `the farmer phone (${maskDigits(phone)}) is not the UAT wallet ${ZERO_AMOUNT_UAT_WALLET}`;
    }
    if (getUgandaServiceProvider(normalized) !== ZERO_AMOUNT_UAT_SERVICE_PROVIDER) {
      return `the wallet is not ${ZERO_AMOUNT_UAT_SERVICE_PROVIDER}`;
    }
    return null;
  } catch {
    return `the farmer phone (${maskDigits(phone)}) is missing or not a valid Uganda mobile`;
  }
}

/** Every fact about the line the test depends on. Throws one refusal listing all problems. */
export function assertZeroAmountUatLine(line: ZeroAmountUatLineFacts): void {
  const problems: string[] = [];
  if (line.stage !== ZERO_AMOUNT_UAT_REQUIRED_STAGE) {
    problems.push(`the line stage is "${line.stage ?? 'unknown'}", it must be ${ZERO_AMOUNT_UAT_REQUIRED_STAGE}`);
  }
  if (line.holdKind) problems.push('the line is on hold');
  const wallet = checkWallet(line.farmerPhone);
  if (wallet) problems.push(wallet);
  if (!line.bankReference?.trim()) {
    problems.push('the line has no bank_reference (it is the Customer Reference No for this test)');
  }
  if (line.lineCurrency !== 'UGX') problems.push('the line currency is not UGX');
  if (line.batchCurrency !== 'UGX') problems.push('the portal batch currency is not UGX');
  if ((line.batchCountry ?? '').trim().toLowerCase() !== 'uganda') {
    problems.push('the portal batch country is not Uganda');
  }
  if (problems.length > 0) throw new ZeroAmountUatRefusal(`Refused: ${problems.join('; ')}`);
}

/** The subset known inside the build transaction (the SQL already enforced stage, hold, currency). */
export function assertZeroAmountUatCandidate(candidate: {
  mobile: string;
  bankReference?: string | null;
}): void {
  const problems: string[] = [];
  const wallet = checkWallet(candidate.mobile);
  if (wallet) problems.push(wallet);
  if (!candidate.bankReference?.trim()) problems.push('the line has no bank_reference');
  if (problems.length > 0) throw new ZeroAmountUatRefusal(`Refused: ${problems.join('; ')}`);
}

// ---------------------------------------------------------------------------
// Read-only lookup
// ---------------------------------------------------------------------------

export type QueryRows = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export type ZeroAmountUatLine = ZeroAmountUatLineFacts & {
  lineId: string;
  farmerName: string;
  /** The portal line's own amount (unchanged by this tool). */
  portalAmount: string | null;
  portalBatchId: string;
  portalBatchRef: string | null;
  portalBatchStatus: string | null;
  released: boolean;
  /** Bank transactions of this line that are pending / processing / completed. */
  liveBankTransactions: number;
};

export const ZERO_AMOUNT_UAT_LINE_SQL = `SELECT pl.id, pl.stage, pl.hold_kind, pl.bank_reference,
       pl.currency AS line_currency, pl.amount, pl.batch_id AS portal_batch_id,
       pb.batch_ref, pb.status AS batch_status, pb.released_at, pb.country AS batch_country,
       pb.currency AS batch_currency, f.name AS farmer_name, f.phone_number
  FROM payment_lines pl
  JOIN payment_batches pb ON pb.id = pl.batch_id
  LEFT JOIN farmers f ON f.farmer_id = pl.farmer_id
 WHERE pl.id = $1::uuid`;

export const ZERO_AMOUNT_UAT_LIVE_TX_SQL = `SELECT COUNT(*)::int AS n
  FROM bank_transactions
 WHERE payment_line_id = $1::uuid AND status::text IN ('pending', 'processing', 'completed')`;

function readPhone(stored: unknown): string | null {
  if (typeof stored !== 'string' || stored === '') return null;
  try {
    return decryptField(stored); // no-op for plain values
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** SELECT only. Returns null when the line does not exist. */
export async function lookupZeroAmountUatLine(
  query: QueryRows,
  lineId: string
): Promise<ZeroAmountUatLine | null> {
  const rows = await query(ZERO_AMOUNT_UAT_LINE_SQL, [lineId]);
  const r = rows[0];
  if (!r) return null;
  const live = await query(ZERO_AMOUNT_UAT_LIVE_TX_SQL, [lineId]);
  return {
    lineId: String(r.id),
    stage: str(r.stage),
    holdKind: str(r.hold_kind),
    bankReference: str(r.bank_reference),
    lineCurrency: str(r.line_currency),
    batchCurrency: str(r.batch_currency),
    batchCountry: str(r.batch_country),
    farmerPhone: readPhone(r.phone_number),
    farmerName: str(r.farmer_name) ?? '',
    portalAmount: str(r.amount),
    portalBatchId: String(r.portal_batch_id),
    portalBatchRef: str(r.batch_ref),
    portalBatchStatus: str(r.batch_status),
    released: r.released_at !== null && r.released_at !== undefined,
    liveBankTransactions: Number(live[0]?.n ?? 0),
  };
}
