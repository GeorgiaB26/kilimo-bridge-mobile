/**
 * One-shot sync: SQLite (local or Render) → Supabase mirror tables.
 * Usage: cd backend && npx tsx scripts/sync-to-supabase.ts
 */
import { initDatabase } from '../src/db/database';
import { syncAllToSupabase, isSupabaseConfigured } from '../src/services/supabaseSync';

initDatabase();

if (!isSupabaseConfigured()) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

syncAllToSupabase().then((result) => {
  if (result.ok) {
    console.log('Sync OK:', result.tables);
    console.log(`Duration: ${result.durationMs}ms`);
    process.exit(0);
  }
  console.error('Sync failed:', result.error);
  process.exit(1);
});
