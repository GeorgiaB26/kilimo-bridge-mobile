/**
 * Apply support ticket schema to Supabase Postgres.
 * Run from backend/: npx tsx scripts/apply-support-tickets-migration.ts
 */
import { ensureMessagingTables } from '../src/services/messagingService';
import { ensureSupportTicketTables } from '../src/services/supportTicketService';
import { closeDatabase } from '../src/db/database';

async function main(): Promise<void> {
  console.log('Ensuring messaging tables…');
  await ensureMessagingTables();
  console.log('Applying support tickets schema…');
  await ensureSupportTicketTables();
  console.log('Done — message_support_tickets + message attachment_url are ready.');
}

main()
  .then(() => closeDatabase())
  .catch((err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
