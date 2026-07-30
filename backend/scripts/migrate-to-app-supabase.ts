/**
 * Migrate server SQLite → NEW App Supabase (NOT admin Supabase).
 * Usage: cd backend && npx tsx scripts/migrate-to-app-supabase.ts
 */
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { initDatabase, getDatabasePath, db } from '../src/db/database';

const BATCH = 300;

function uuidOrNull(id: string | undefined | null): string | null {
  if (!id) return null;
  const clean = id.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    return clean;
  }
  return null;
}

async function upsertBatched(
  client: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
    else synced += chunk.length;
  }
  return { synced, errors };
}

async function main(): Promise<void> {
  const url = process.env.APP_SUPABASE_URL;
  const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set APP_SUPABASE_URL and APP_SUPABASE_SERVICE_ROLE_KEY (NEW app project only)');
    process.exit(1);
  }

  initDatabase();
  const client = createClient(url, key, { auth: { persistSession: false } });
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    dbPath: getDatabasePath(),
    tables: {} as Record<string, { source: number; synced: number; errors: string[] }>,
    failed: false,
  };

  // Cooperatives from membership_groups
  const groups = db.prepare('SELECT id, name, created_at FROM membership_groups').all() as {
    id: string;
    name: string;
  }[];
  const coopRows = groups.map((g) => ({
    id: uuidOrNull(g.id) ?? undefined,
    name: g.name,
    country: 'Kenya',
    legacy_id: g.id,
    is_deleted: false,
    synced_at: new Date().toISOString(),
  }));
  const coopResult = await upsertBatched(client, 'cooperatives', coopRows.filter((r) => r.id) as Record<string, unknown>[]);
  (report.tables as Record<string, unknown>).cooperatives = { source: groups.length, ...coopResult };

  // Farmers
  const farmers = db.prepare(`
    SELECT f.*, mg.name as membership_group_name
    FROM farmers f LEFT JOIN membership_groups mg ON f.membership_group_id = mg.id
  `).all() as Record<string, unknown>[];

  const farmerRows = farmers.map((f) => {
    const id = uuidOrNull(f.farmer_id as string) ?? uuidv4();
    return {
      id,
      legacy_farmer_id: f.farmer_id,
      name: f.name,
      phone: f.phone_number,
      country: f.country ?? 'Kenya',
      cooperative_id: uuidOrNull(f.membership_group_id as string),
      district: f.district,
      sub_county: f.sub_county,
      village: f.village,
      land_size_acres: f.size_of_land,
      primary_crop: f.project_1,
      occupation: f.occupation,
      membership_type: f.membership_type,
      role: 'farmer',
      currency: 'KES',
      profile_photo_url: f.picture_url,
      status: f.status === 'Active' ? 'active' : 'pending',
      activated: f.status === 'Active',
      cooperative_verified: true,
      is_deleted: false,
      synced_at: new Date().toISOString(),
      updated_at: f.updated_at ?? new Date().toISOString(),
    };
  });

  const farmerResult = await upsertBatched(client, 'farmers', farmerRows);
  (report.tables as Record<string, unknown>).farmers = { source: farmers.length, ...farmerResult };

  // App users
  const users = db.prepare('SELECT * FROM users').all() as Record<string, unknown>[];
  const userRows = users.map((u) => ({
    id: uuidOrNull(u.user_id as string) ?? uuidv4(),
    legacy_user_id: u.user_id,
    phone: u.phone_number,
    name: u.name,
    role: u.role === 'agent' ? 'agent' : u.role,
    farmer_id: uuidOrNull(u.farmer_id as string),
    district: u.district,
    region: u.region,
    status: u.status,
    is_deleted: false,
    synced_at: new Date().toISOString(),
  }));
  const userResult = await upsertBatched(client, 'app_users', userRows);
  (report.tables as Record<string, unknown>).app_users = { source: users.length, ...userResult };

  // Projects from program_projects
  const hasProjects = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='program_projects'"
  ).get();
  if (hasProjects) {
    const projects = db.prepare('SELECT * FROM program_projects').all() as Record<string, unknown>[];
    const projectRows = projects.map((p) => ({
      id: uuidOrNull(p.id as string) ?? uuidv4(),
      legacy_project_id: p.id,
      name: p.name,
      sector: p.region,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status ?? 'active',
      is_deleted: false,
      synced_at: new Date().toISOString(),
    }));
    const projResult = await upsertBatched(client, 'projects', projectRows);
    (report.tables as Record<string, unknown>).projects = { source: projects.length, ...projResult };
  }

  // Payments
  const payments = db.prepare('SELECT * FROM payments').all() as Record<string, unknown>[];
  const paymentRows = payments.map((p) => ({
    id: uuidOrNull(p.id as string) ?? uuidv4(),
    legacy_payment_id: p.id,
    farmer_id: uuidOrNull(p.farmer_id as string),
    amount: p.amount,
    currency: p.currency ?? 'KES',
    payment_method: p.payment_method,
    status: p.payment_status?.toString().toLowerCase() ?? 'pending',
    is_deleted: false,
    synced_at: new Date().toISOString(),
  })).filter((p) => p.farmer_id);

  const payResult = await upsertBatched(client, 'payments', paymentRows as Record<string, unknown>[]);
  (report.tables as Record<string, unknown>).payments = { source: payments.length, ...payResult };

  report.failed = Object.values(report.tables as Record<string, { errors: string[] }>).some(
    (t) => t.errors?.length > 0
  );
  report.completedAt = new Date().toISOString();

  const out = path.resolve(process.cwd(), 'data', 'app-migration-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('App migration report:', out);
  if (report.failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
