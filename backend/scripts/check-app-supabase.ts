/**
 * Verify NEW App Supabase project URL + keys and that schema tables exist.
 * Usage: cd backend && npx tsx scripts/check-app-supabase.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.APP_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.APP_SUPABASE_ANON_KEY;

async function main() {
  console.log('=== App Supabase check ===\n');

  if (!url) {
    console.error('✗ APP_SUPABASE_URL is not set in backend/.env');
    process.exit(1);
  }
  console.log(`Project URL: ${url}`);

  const restProbe = await fetch(`${url}/rest/v1/`);
  console.log(`REST reachable: ${restProbe.status === 401 || restProbe.ok ? 'yes' : 'no'} (${restProbe.status})`);

  if (!serviceKey) {
    console.log('\n⚠ APP_SUPABASE_SERVICE_ROLE_KEY missing — add it from Supabase → Settings → API');
    console.log('  (needed for migrate:app-supabase, not for mobile login)');
    process.exit(0);
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = ['cooperatives', 'farmers', 'projects', 'tasks', 'payments'];
  let missing = 0;

  for (const table of tables) {
    const { error } = await sb.from(table).select('id').limit(1);
    if (error) {
      console.log(`✗ ${table}: ${error.message}`);
      missing++;
    } else {
      console.log(`✓ ${table}`);
    }
  }

  if (missing > 0) {
    console.log('\n→ Run schema SQL in Supabase SQL Editor:');
    console.log('  supabase/app/migrations/001_kilimo_app_schema.sql');
    process.exit(1);
  }

  if (anonKey) {
    const anon = createClient(url, anonKey);
    const { error } = await anon.from('cooperatives').select('id').limit(1);
    console.log(error ? `⚠ anon key query failed: ${error.message}` : '✓ anon key works');
  } else {
    console.log('\n⚠ APP_SUPABASE_ANON_KEY not in backend/.env (optional here; set in mobile/.env)');
  }

  console.log('\n✓ App Supabase is configured and schema looks good.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
