/**
 * Dry run of the Uganda Equity batch builder. Writes NOTHING to the database, uploads nothing.
 * Prints counts, amounts and file names only — no phone numbers, no file contents.
 *
 * Run from backend/: npx tsx scripts/run-equity-batch-dry-run.ts
 * Needs DATABASE_URL, EQUITY_SFTP_CUSTOMER_ID, EQUITY_UG_DEBIT_ACCOUNT, EQUITY_AUTO_SEND_MAX_TOTAL.
 */
import { closeDatabase } from '../src/db/database';
import { buildUgandaBatches } from '../src/services/equityBatchService';

async function main(): Promise<void> {
  const result = await buildUgandaBatches({ dryRun: true });

  if (result.status === 'locked') {
    console.log('Another batch run holds the lock; nothing was done.');
    return;
  }

  console.log('Equity Uganda batch dry run (nothing written)');
  console.log(`Candidates: ${result.candidateCount}`);
  console.log(`Batches: ${result.batches.length}`);
  result.batches.forEach((b, i) => {
    console.log(`  #${i + 1} ${b.filename}  rows=${b.rowCount}  amount=${b.totalAmount}`);
  });
  console.log(`Total amount: ${result.totalAmount}`);
  console.log(`Skipped: ${result.skippedCount}`);
  for (const [reason, count] of Object.entries(result.skippedByReason)) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log(`Deferred: ${result.deferredCount}`);
}

main()
  .catch((err) => {
    console.error('Dry run failed:', err instanceof Error ? err.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
