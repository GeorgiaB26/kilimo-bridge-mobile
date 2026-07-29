/**
 * Full SQLite → Supabase migration with integrity checks and JSON report.
 * Usage: cd backend && npx tsx scripts/migrate-sqlite-to-supabase.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { initDatabase, getDatabasePath, db } from '../src/db/database';

const BATCH = 400;
const MAX_RETRIES = 3;

interface TableSpec {
  name: string;
  pk: string;
  selectSql: string;
}

const TABLE_ORDER: TableSpec[] = [
  { name: 'membership_groups', pk: 'id', selectSql: 'SELECT * FROM membership_groups' },
  { name: 'projects', pk: 'id', selectSql: 'SELECT * FROM projects' },
  { name: 'sectors', pk: 'id', selectSql: 'SELECT * FROM sectors' },
  { name: 'aggregation_centres', pk: 'centre_id', selectSql: 'SELECT * FROM aggregation_centres' },
  { name: 'locations', pk: 'location_id', selectSql: 'SELECT * FROM locations' },
  { name: 'farmers', pk: 'farmer_id', selectSql: `
    SELECT f.*, mg.name AS membership_group_name
    FROM farmers f LEFT JOIN membership_groups mg ON f.membership_group_id = mg.id
  ` },
  {
    name: 'users',
    pk: 'user_id',
    selectSql: `
      SELECT user_id, phone_number, name, role, farmer_id, district, region,
        aggregation_center, status, created_at, updated_at
      FROM users
    `,
  },
  { name: 'programs', pk: 'id', selectSql: 'SELECT * FROM programs' },
  { name: 'program_projects', pk: 'id', selectSql: 'SELECT * FROM program_projects' },
  { name: 'tasks', pk: 'id', selectSql: 'SELECT * FROM tasks' },
  { name: 'program_project_farmers', pk: 'id', selectSql: 'SELECT * FROM program_project_farmers' },
  { name: 'farmer_projects', pk: 'id', selectSql: 'SELECT * FROM farmer_projects' },
  { name: 'farmer_tasks', pk: 'id', selectSql: 'SELECT * FROM farmer_tasks' },
  { name: 'payments', pk: 'id', selectSql: 'SELECT * FROM payments' },
  { name: 'notifications', pk: 'id', selectSql: 'SELECT * FROM notifications' },
  { name: 'agents', pk: 'agent_id', selectSql: 'SELECT * FROM agents' },
  { name: 'bank_transactions', pk: 'id', selectSql: 'SELECT * FROM bank_transactions' },
  { name: 'payment_verifications', pk: 'id', selectSql: 'SELECT * FROM payment_verifications' },
  { name: 'import_sessions', pk: 'id', selectSql: `
    SELECT id, status, total_rows, valid_rows, invalid_rows, duplicates,
      imported_count, created_at, completed_at FROM import_sessions
  ` },
  { name: 'centre_inventory', pk: 'id', selectSql: 'SELECT * FROM centre_inventory' },
  { name: 'otp_codes', pk: 'id', selectSql: 'SELECT id, phone_number, code, expires_at, used, created_at FROM otp_codes' },
  { name: 'audit_logs', pk: 'id', selectSql: 'SELECT * FROM audit_logs' },
];

function tableExists(name: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`
  ).get(name);
  return Boolean(row);
}

async function upsertBatched(
  client: ReturnType<typeof createClient>,
  table: string,
  pk: string,
  rows: Record<string, unknown>[]
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const enriched = rows.map((r) => ({
    ...r,
    is_deleted: false,
    synced_at: new Date().toISOString(),
  }));

  for (let i = 0; i < enriched.length; i += BATCH) {
    const chunk = enriched.slice(i, i + BATCH);
    let attempt = 0;
    let ok = false;
    while (attempt < MAX_RETRIES && !ok) {
      attempt++;
      const { error } = await client.from(table).upsert(chunk, { onConflict: pk });
      if (!error) {
        synced += chunk.length;
        ok = true;
      } else {
        if (attempt >= MAX_RETRIES) {
          errors.push(`${table} batch ${i}: ${error.message}`);
        } else {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
  }
  return { synced, errors };
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  initDatabase();
  const client = createClient(url, key, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const report: {
    startedAt: string;
    dbPath: string;
    tables: Record<string, { source: number; synced: number; errors: string[] }>;
    failed: boolean;
    completedAt?: string;
    durationMs?: number;
  } = {
    startedAt,
    dbPath: getDatabasePath(),
    tables: {},
    failed: false,
  };

  const start = Date.now();

  for (const spec of TABLE_ORDER) {
    if (!tableExists(spec.name)) {
      report.tables[spec.name] = { source: 0, synced: 0, errors: ['table missing in SQLite — skipped'] };
      continue;
    }

    const sourceCount = (db.prepare(`SELECT COUNT(*) as c FROM "${spec.name}"`).get() as { c: number }).c;
    let rows: Record<string, unknown>[] = [];
    try {
      rows = db.prepare(spec.selectSql).all() as Record<string, unknown>[];
    } catch (err) {
      report.tables[spec.name] = {
        source: sourceCount,
        synced: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      };
      report.failed = true;
      continue;
    }

    const { synced, errors } = await upsertBatched(client, spec.name, spec.pk, rows);
    report.tables[spec.name] = { source: sourceCount, synced, errors };
    if (errors.length > 0 || synced < sourceCount) {
      report.failed = true;
    }
    console.log(`${spec.name}: ${synced}/${sourceCount}${errors.length ? ' ERRORS' : ''}`);
  }

  const farmerCount = report.tables.farmers?.synced ?? 0;
  await client.from('sync_meta').upsert({
    id: 'default',
    last_full_sync_at: new Date().toISOString(),
    last_sync_status: report.failed ? 'migration_partial' : 'migration_ok',
    farmers_count: farmerCount,
    updated_at: new Date().toISOString(),
  });

  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - start;

  const outPath = path.resolve(process.cwd(), 'data', 'migration-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${outPath}`);
  console.log(`Duration: ${report.durationMs}ms`);

  if (report.failed) {
    console.error('Migration completed with errors — review migration-report.json');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
