/**
 * Apply messaging/notifications schema to Supabase Postgres.
 * Run from backend/: npx tsx scripts/apply-messaging-migration.ts
 *
 * Requires DATABASE_URL in backend/.env (same Supabase pooler string as Render).
 */
import { ensureMessagingTables } from '../src/services/messagingService';
import { closeDatabase } from '../src/db/database';

async function main(): Promise<void> {
  console.log('Applying messaging & notifications schema...');
  await ensureMessagingTables();
  console.log('Done — message_threads, notification_settings, and notification columns are ready.');
}

main()
  .then(() => closeDatabase())
  .catch((err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
