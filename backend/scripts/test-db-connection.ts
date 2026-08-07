/**
 * Smoke-test Supabase Postgres connectivity.
 * Run from backend/: npx tsx scripts/test-db-connection.ts
 */
import { testConnection, closeDatabase } from '../src/db/database';

async function main(): Promise<void> {
  const { farmerCount } = await testConnection();
  console.log(`Connected to Postgres — farmers: ${farmerCount}`);
}

main()
  .then(() => closeDatabase())
  .catch((err) => {
    console.error('Database connection failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
