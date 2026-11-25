/**
 * ONE-OFF Equity UAT negative test: send exactly ONE Uganda wallet row with Payment Amount 0 so
 * Equity answers with a NACK (RJCT / VERFAL, "Amount should be greater than zero").
 *
 * It uses the REAL generator, builder (buildUgandaPortalBatches), uploader (sendBuiltBatches)
 * and, later, the real response poll. The only difference from a normal release is the
 * parameter-only seam `zeroAmountOverride`, which plans the one named line at amount 0.
 * bank_transactions.amount is stored as 0; the portal line's own amount is not changed.
 *
 * Modes (run from backend/ in a Render shell on the Equity UAT service):
 *   npx tsx scripts/send-equity-zero-amount-uat.ts <lineId>             # dry run (default)
 *   npx tsx scripts/send-equity-zero-amount-uat.ts <lineId> --dry-run   # same
 *   npx tsx scripts/send-equity-zero-amount-uat.ts <lineId> --confirm   # builds, uploads (SFTP)
 *   npx tsx scripts/send-equity-zero-amount-uat.ts <lineId> --status    # read-only: where is it now
 *
 * Needs: DATABASE_URL, the EQUITY_SFTP_* variables, EQUITY_PGP / bank public key variables,
 * EQUITY_SFTP_CUSTOMER_ID, EQUITY_UG_DEBIT_ACCOUNT, EQUITY_AUTO_SEND_MAX_TOTAL and
 * ZERO_AMOUNT_UAT_LINE_ID (must equal <lineId>).
 *
 * Hard refusals, thrown before any database write or SFTP connection (all modes unless noted):
 *   - the line id must equal ZERO_AMOUNT_UAT_LINE_ID
 *   - EQUITY_SFTP_HOST must be the Equity UAT host (production and any other host are refused)
 *   - --confirm only: EQUITY_AUTO_SEND_ENABLED and EQUITY_RESPONSE_POLL_ENABLED must be off
 *   - the farmer phone must normalise to the UAT wallet (AIRTELMONEY-UG)
 *   - the line must be at stage payment_approved and exactly one row must be built
 *   - the amount override is only ever 0
 * The dry run and --status never write and never connect to SFTP. The dry run masks the debit
 * account and the beneficiary name; nothing prints a secret.
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { closeDatabase, query as dbQuery } from '../src/db/database';
import { logAudit } from '../src/services/auditService';
import {
  buildUgandaPortalBatches,
  equityUgandaBatchConfigFromEnv,
  generateUgandaBatchFile,
} from '../src/services/equityBatchService';
import { normalizeUgandaMobile } from '../src/services/equityCountryConfig';
import { serializeEquityCsv, type EquityCsvRow } from '../src/services/equityCsvGenerator';
import {
  describeError,
  loadEquitySftpConfig,
  sendBuiltBatches,
  type SftpClientLike,
} from '../src/services/equitySftpService';
import {
  assertSchedulerFlagsOff,
  assertZeroAmountUatEnv,
  assertZeroAmountUatLine,
  lookupZeroAmountUatLine,
  maskDigits,
  ZERO_AMOUNT_UAT_SERVICE_PROVIDER,
  ZERO_AMOUNT_UAT_WALLET,
  ZeroAmountUatRefusal,
  type QueryRows,
  type ZeroAmountUatLine,
} from '../src/services/equityZeroAmountUat';

export type ZeroAmountUatMode = 'dry-run' | 'confirm' | 'status';

export type ZeroAmountUatDeps = {
  /** Read queries. Defaults to the shared pool. */
  query?: QueryRows;
  /** Fake SFTP client for tests; the real one is used when absent. */
  createClient?: () => SftpClientLike;
  log?: (line: string) => void;
  now?: () => Date;
  audit?: typeof logAudit;
};

export type ZeroAmountUatResult = {
  mode: ZeroAmountUatMode;
  /** True when the mode did what it is for (dry run printed a valid row, file uploaded, ...). */
  ok: boolean;
  filename?: string;
  uploaded?: number;
  failed?: number;
  uncertain?: number;
  unrecorded?: number;
};

const maskName = (name: string): string => (name.trim() ? `${name.trim()[0]}***` : '(none)');

function describeLine(line: ZeroAmountUatLine, log: (l: string) => void): void {
  log('Target payment line');
  log(`  line id          : ${line.lineId}`);
  log(`  portal batch     : ${line.portalBatchRef ?? '(no ref)'} (status ${line.portalBatchStatus ?? 'unknown'}, ${line.released ? 'released to bank' : 'NOT released yet'})`);
  log(`  bank_reference   : ${line.bankReference ?? '(none)'}`);
  log(`  stage            : ${line.stage ?? 'unknown'}`);
  log(`  farmer phone     : ${describeWallet(line.farmerPhone)}`);
  log(`  portal amount    : ${line.portalAmount ?? 'unknown'} ${line.lineCurrency ?? ''} (stays unchanged; the bank row is sent as 0)`);
  log(`  live bank txns   : ${line.liveBankTransactions}`);
}

/** The full number is shown only when it IS the UAT wallet; any other number is masked. */
function describeWallet(phone: string | null): string {
  try {
    if (normalizeUgandaMobile(phone ?? '') === ZERO_AMOUNT_UAT_WALLET) {
      return `${ZERO_AMOUNT_UAT_WALLET} (UAT wallet)`;
    }
  } catch {
    /* fall through to the masked form */
  }
  return `${maskDigits(phone)} (NOT the UAT wallet)`;
}

export async function runZeroAmountUat(
  opts: { lineId: string; mode: ZeroAmountUatMode },
  deps: ZeroAmountUatDeps = {}
): Promise<ZeroAmountUatResult> {
  const log = deps.log ?? ((l: string) => console.log(l));
  const env = process.env;
  const { lineId, mode } = opts;

  // 1. Refusals that need nothing but the environment: before any database or SFTP access.
  assertZeroAmountUatEnv(lineId, env);
  if (mode === 'confirm') assertSchedulerFlagsOff(env);

  const query: QueryRows = deps.query ?? ((text, params) => dbQuery(text, params));

  // 2. Read-only look at the line.
  const line = await lookupZeroAmountUatLine(query, lineId);
  if (!line) throw new ZeroAmountUatRefusal('Refused: no payment line with that id');
  describeLine(line, log);

  if (mode === 'status') {
    await printStatus(query, line, log);
    return { mode, ok: true };
  }

  // 3. Facts about the line.
  assertZeroAmountUatLine(line);

  if (mode === 'dry-run') return dryRun(line, deps, log);
  return confirmSend(line, deps, log);
}

function dryRun(
  line: ZeroAmountUatLine,
  deps: ZeroAmountUatDeps,
  log: (l: string) => void
): ZeroAmountUatResult {
  const config = equityUgandaBatchConfigFromEnv();
  const file = generateUgandaBatchFile(config, (deps.now ?? (() => new Date()))(), [
    {
      bankTransactionId: 'dry-run',
      beneficiaryName: line.farmerName,
      beneficiaryMobileNo: line.farmerPhone ?? '',
      amount: 0,
      bankReference: line.bankReference,
    },
  ]);
  const row = file.rows[0];
  const bad: string[] = [];
  if (file.rows.length !== 1) bad.push('not exactly one row');
  if (row['Transaction Type Code'] !== 'MW') bad.push('type is not MW');
  if (row['Beneficiary Mobile No'] !== ZERO_AMOUNT_UAT_WALLET) bad.push('wallet is not 0751000000');
  if (row['Service Provider'] !== ZERO_AMOUNT_UAT_SERVICE_PROVIDER) bad.push('provider is wrong');
  if (row['Transaction Currency'] !== 'UGX') bad.push('currency is not UGX');
  if (row['Payment Amount'] !== '0') bad.push('amount is not 0');
  if (bad.length > 0) throw new Error(`Dry run produced an unexpected row: ${bad.join(', ')}`);

  const masked: EquityCsvRow = {
    ...row,
    'Debit Account No.': maskDigits(row['Debit Account No.']),
    'Beneficiary Name': maskName(row['Beneficiary Name']),
  };
  log('');
  log('DRY RUN: nothing was written and nothing was sent.');
  log(`File name (before .pgp): ${file.filename}`);
  log('Row as it would be sent (debit account and name masked):');
  for (const l of serializeEquityCsv([masked]).trimEnd().split('\r\n')) log(`  ${l}`);
  log(`Value Date in this row is ${row['Value Date']} (today in Kampala). The real run builds the file again; compare with the date agreed with Equity.`);
  if (!line.released) {
    log('NOTE: the portal batch is not released yet. That is expected before the Banking Agent presses Release to bank. --confirm will refuse until it is.');
  }
  if (line.liveBankTransactions > 0) {
    log('WARNING: this line already has a live bank transaction, so --confirm would refuse.');
  }
  return { mode: 'dry-run', ok: true, filename: file.filename };
}

async function confirmSend(
  line: ZeroAmountUatLine,
  deps: ZeroAmountUatDeps,
  log: (l: string) => void
): Promise<ZeroAmountUatResult> {
  if (!line.released) {
    throw new ZeroAmountUatRefusal('Refused: the portal batch has not been released to the bank yet');
  }
  if (line.liveBankTransactions > 0) {
    throw new ZeroAmountUatRefusal('Refused: the line already has a live bank transaction');
  }
  // Fails before anything is written if the SFTP settings are incomplete. Does NOT connect.
  loadEquitySftpConfig(process.env);

  const built = await buildUgandaPortalBatches({
    dryRun: false,
    initiatedBy: null,
    zeroAmountOverride: { onlyLineId: line.lineId, forceAmount: 0 },
  });
  if (built.status === 'locked') {
    throw new Error('Another Equity batch run holds the lock. Nothing was written or sent. Try again in a minute.');
  }
  if (built.batches.length !== 1 || built.batches[0].rowCount !== 1 || built.totalAmount !== 0) {
    throw new Error(
      `Stopped before upload: expected exactly 1 file with 1 row at amount 0, got ${built.batches.length} file(s). Do not retry; ask a developer.`
    );
  }
  const batch = built.batches[0];
  log(`Built 1 file with 1 row at amount 0: ${batch.filename}`);

  const sent = await sendBuiltBatches(built.batches, {
    ...(deps.createClient ? { createClient: deps.createClient } : {}),
    ...(deps.query ? { query: deps.query } : {}),
    env: process.env,
  });
  const ok = sent.uploaded === 1 && sent.failed === 0 && sent.uncertain === 0 && sent.unrecorded === 0;

  try {
    await (deps.audit ?? logAudit)({
      action: 'banking.batch_sent',
      category: 'financial',
      resourceType: 'equity_payment_batch',
      resourceId: batch.batchId ?? undefined,
      details: {
        country: 'UG',
        source: 'portal',
        zeroAmountUat: true,
        batches: 1,
        rows: 1,
        uploaded: sent.uploaded,
        failed: sent.failed,
        uncertain: sent.uncertain,
        unrecorded: sent.unrecorded,
      },
      success: ok,
    });
  } catch (err) {
    log(`(audit entry could not be written: ${describeError(err, process.env.EQUITY_SFTP_PASSWORD)})`);
  }

  log(`Upload result: uploaded=${sent.uploaded} failed=${sent.failed} uncertain=${sent.uncertain} unrecorded=${sent.unrecorded}`);
  if (ok) {
    log('SUCCESS: the file is on Equity UAT. Wait for the NACK, then run the response poll.');
  } else {
    log('STOP: do not run this again. Check the Equity folders and ask a developer.');
    for (const r of sent.results) if (r.error) log(`  detail: ${r.error}`);
  }
  return {
    mode: 'confirm',
    ok,
    filename: batch.filename,
    uploaded: sent.uploaded,
    failed: sent.failed,
    uncertain: sent.uncertain,
    unrecorded: sent.unrecorded,
  };
}

async function printStatus(
  query: QueryRows,
  line: ZeroAmountUatLine,
  log: (l: string) => void
): Promise<void> {
  let failReason = '(not readable)';
  try {
    const r = await query('SELECT fail_reason FROM payment_lines WHERE id = $1::uuid', [line.lineId]);
    failReason = r[0]?.fail_reason ? String(r[0].fail_reason) : '(none)';
  } catch {
    /* the column is owned by the portal; do not fail the status check over it */
  }
  log(`  fail reason      : ${failReason}`);
  const txs = await query(
    `SELECT bt.status::text AS tx_status, bt.amount, bt.customer_reference, bt.equity_error_code,
            bt.equity_error_description, eb.status AS batch_status, eb.filename
       FROM bank_transactions bt
       LEFT JOIN equity_payment_batches eb ON eb.id = bt.batch_id
      WHERE bt.payment_line_id = $1::uuid
      ORDER BY bt.created_at DESC
      LIMIT 5`,
    [line.lineId]
  );
  if (txs.length === 0) log('  bank transactions: none');
  for (const t of txs) {
    log(
      `  bank transaction : status=${String(t.tx_status)} amount=${String(t.amount)} reference=${String(t.customer_reference)} error_code=${String(t.equity_error_code ?? '')} batch=${String(t.batch_status ?? '')}`
    );
    if (t.equity_error_description) log(`  bank reason      : ${String(t.equity_error_description)}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseZeroAmountUatArgs(argv: readonly string[]): { lineId: string; mode: ZeroAmountUatMode } {
  let lineId = '';
  const modes = new Set<ZeroAmountUatMode>();
  for (const arg of argv) {
    if (arg === '--confirm') modes.add('confirm');
    else if (arg === '--dry-run') modes.add('dry-run');
    else if (arg === '--status') modes.add('status');
    else if (arg.startsWith('--line=')) lineId = arg.slice('--line='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (!lineId) lineId = arg;
    else throw new Error('Only one payment line id may be given');
  }
  if (modes.size > 1) throw new Error('Use only one of --dry-run, --confirm, --status');
  if (!lineId) throw new Error('Usage: send-equity-zero-amount-uat.ts <paymentLineId> [--dry-run | --confirm | --status]');
  return { lineId, mode: [...modes][0] ?? 'dry-run' };
}

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(process.cwd(), '.env') });
  const args = parseZeroAmountUatArgs(process.argv.slice(2));
  const result = await runZeroAmountUat(args);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(
        err instanceof ZeroAmountUatRefusal
          ? err.message
          : `Failed: ${describeError(err, process.env.EQUITY_SFTP_PASSWORD)}`
      );
      process.exitCode = 1;
    })
    .finally(() => closeDatabase());
}
