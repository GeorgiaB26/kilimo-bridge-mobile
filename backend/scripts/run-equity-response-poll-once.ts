/**
 * Run ONE Equity response poll (ACK / NACK / PSR) from the command line, for the Equity UAT
 * zero-amount test. It calls the real runEquityResponsePoll once, exactly as the scheduler would,
 * with the poll switch turned on for this process only (the service's own flags are not touched).
 *
 * It makes ONE SFTP connection (no retries), reads the inbound folder, and applies every NEW
 * response file it finds, not only ours: matching lines are updated in the database. Nothing is
 * deleted or moved on the server. Output is counts only.
 *
 * Run from backend/ in a Render shell on the Equity UAT service:
 *   npx tsx scripts/run-equity-response-poll-once.ts
 *
 * Refuses (before any connection) unless EQUITY_SFTP_HOST is the Equity UAT host, and unless
 * EQUITY_AUTO_SEND_ENABLED and EQUITY_RESPONSE_POLL_ENABLED are both off (Equity allows one SFTP
 * login at a time; the scheduler must not be running its own).
 */
import { config as loadEnv } from 'dotenv';
import path from 'path';
import { closeDatabase } from '../src/db/database';
import { runEquityResponsePoll } from '../src/services/equityResponseService';
import { describeError } from '../src/services/equitySftpService';
import {
  assertEquityUatHost,
  assertSchedulerFlagsOff,
  ZeroAmountUatRefusal,
} from '../src/services/equityZeroAmountUat';

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(process.cwd(), '.env') });
  assertEquityUatHost(process.env);
  assertSchedulerFlagsOff(process.env);

  const result = await runEquityResponsePoll(
    {},
    { env: { ...process.env, EQUITY_RESPONSE_POLL_ENABLED: 'true' } }
  );
  if (result.status !== 'ok') {
    console.log(`Poll did not run (status ${result.status}).`);
    process.exitCode = 1;
    return;
  }
  const { status: _status, ...counts } = result;
  console.log(
    Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
  );
  if (counts.filesNew === 0) {
    console.log('No new response file yet. Wait a few minutes and run this again.');
  } else if (counts.errors > 0 || counts.unmatched > 0 || counts.needsReview > 0) {
    console.log('STOP: something did not match cleanly. Ask a developer before running again.');
    process.exitCode = 1;
  } else {
    console.log('OK: response files were applied with no errors, no unmatched rows and nothing to review.');
  }
}

main()
  .catch((err) => {
    console.error(
      err instanceof ZeroAmountUatRefusal
        ? err.message
        : `Response poll failed: ${describeError(err, process.env.EQUITY_SFTP_PASSWORD)}`
    );
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
