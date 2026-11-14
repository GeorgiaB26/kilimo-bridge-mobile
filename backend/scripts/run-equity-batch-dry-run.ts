/**
 * Dry run of the Uganda Equity batch builder. Writes NOTHING to the database, uploads nothing.
 * Prints counts, amounts and file names only — no phone numbers, no names, no file contents.
 *
 * Run from backend/:
 *   npx tsx scripts/run-equity-batch-dry-run.ts                    # payments table (default)
 *   npx tsx scripts/run-equity-batch-dry-run.ts --source=portal    # payment lines released in the portal
 *   npx tsx scripts/run-equity-batch-dry-run.ts --portal           # same as --source=portal
 * Needs DATABASE_URL, EQUITY_SFTP_CUSTOMER_ID, EQUITY_UG_DEBIT_ACCOUNT, EQUITY_AUTO_SEND_MAX_TOTAL.
 */
import { closeDatabase } from '../src/db/database';
import { buildUgandaBatches, buildUgandaPortalBatches } from '../src/services/equityBatchService';

type Source = 'payments' | 'portal';

function parseSource(argv: readonly string[]): Source {
  let source: Source = 'payments';
  for (const arg of argv) {
    if (arg === '--portal' || arg === '--source=portal') source = 'portal';
    else if (arg === '--source=payments') source = 'payments';
    else if (arg.startsWith('--source=')) {
      throw new Error(`Unknown source "${arg.slice('--source='.length)}" (use payments or portal)`);
    }
  }
  return source;
}

async function main(): Promise<void> {
  const source = parseSource(process.argv.slice(2));
  const result =
    source === 'portal'
      ? await buildUgandaPortalBatches({ dryRun: true })
      : await buildUgandaBatches({ dryRun: true });

  if (result.status === 'locked') {
    console.log('Another batch run holds the lock; nothing was done.');
    return;
  }

  console.log(`Equity Uganda batch dry run — source: ${source} (nothing written)`);
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
