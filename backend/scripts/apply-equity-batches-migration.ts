/**
 * Apply Equity SFTP batch schema to Supabase Postgres.
 * Run from backend/: npx tsx scripts/apply-equity-batches-migration.ts
 *
 * Requires DATABASE_URL in backend/.env (same Supabase pooler string as Render).
 */
import { ensureEquityBatchTables } from '../src/services/equityBatchSchema';
import { closeDatabase } from '../src/db/database';

async function main(): Promise<void> {
  console.log('Applying Equity SFTP batch schema (018 + 019 RLS)…');
  await ensureEquityBatchTables();
  console.log(
    'Done — equity_payment_batches, equity_response_files, bank_transactions file-channel columns, and RLS policies are ready.'
  );
}

main()
  .then(() => closeDatabase())
  .catch((err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
