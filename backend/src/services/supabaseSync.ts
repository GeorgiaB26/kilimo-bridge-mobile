import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db/database';

const BATCH_SIZE = 400;

export interface SyncResult {
  ok: boolean;
  error?: string;
  tables?: Record<string, number>;
  durationMs?: number;
}

let adminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

async function upsertBatched(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict?: string
): Promise<number> {
  if (rows.length === 0) return 0;
  let synced = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client.from(table).upsert(chunk, onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table}: ${error.message}`);
    synced += chunk.length;
  }
  return synced;
}

export async function syncAllToSupabase(): Promise<SyncResult> {
  const client = getSupabaseAdmin();
  if (!client) {
    return { ok: false, error: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend' };
  }

  const start = Date.now();
  const tables: Record<string, number> = {};

  try {
    tables.membership_groups = await upsertBatched(
      client,
      'membership_groups',
      db.prepare('SELECT id, name, created_at FROM membership_groups').all() as Record<string, unknown>[]
    );

    tables.projects = await upsertBatched(
      client,
      'projects',
      db.prepare('SELECT id, name, created_at FROM projects').all() as Record<string, unknown>[]
    );

    const farmers = db.prepare(`
      SELECT f.*, mg.name AS membership_group_name
      FROM farmers f
      LEFT JOIN membership_groups mg ON f.membership_group_id = mg.id
    `).all() as Record<string, unknown>[];
    tables.farmers = await upsertBatched(client, 'farmers', farmers, 'farmer_id');

    const users = db.prepare(`
      SELECT user_id, phone_number, name, role, farmer_id, district, region,
        aggregation_center, status, created_at, updated_at
      FROM users
    `).all() as Record<string, unknown>[];
    tables.users = await upsertBatched(client, 'users', users, 'user_id');

    tables.sectors = await upsertBatched(
      client,
      'sectors',
      db.prepare('SELECT * FROM sectors').all() as Record<string, unknown>[],
      'id'
    );

    tables.programs = await upsertBatched(
      client,
      'programs',
      db.prepare('SELECT * FROM programs').all() as Record<string, unknown>[],
      'id'
    );

    tables.program_projects = await upsertBatched(
      client,
      'program_projects',
      db.prepare('SELECT * FROM program_projects').all() as Record<string, unknown>[],
      'id'
    );

    tables.tasks = await upsertBatched(
      client,
      'tasks',
      db.prepare('SELECT * FROM tasks').all() as Record<string, unknown>[],
      'id'
    );

    tables.program_project_farmers = await upsertBatched(
      client,
      'program_project_farmers',
      db.prepare('SELECT * FROM program_project_farmers').all() as Record<string, unknown>[],
      'id'
    );

    tables.farmer_tasks = await upsertBatched(
      client,
      'farmer_tasks',
      db.prepare('SELECT * FROM farmer_tasks').all() as Record<string, unknown>[],
      'id'
    );

    tables.payments = await upsertBatched(
      client,
      'payments',
      db.prepare(`
        SELECT id, farmer_id, farmer_project_id, project_name, amount, currency,
          payment_method, payment_status, mpesa_reference, verification_status, created_at, paid_at
        FROM payments
      `).all() as Record<string, unknown>[],
      'id'
    );

    tables.aggregation_centres = await upsertBatched(
      client,
      'aggregation_centres',
      db.prepare('SELECT * FROM aggregation_centres').all() as Record<string, unknown>[],
      'centre_id'
    );

    tables.import_sessions = await upsertBatched(
      client,
      'import_sessions',
      db.prepare(`
        SELECT id, status, total_rows, valid_rows, invalid_rows, duplicates,
          imported_count, created_at, completed_at
        FROM import_sessions
      `).all() as Record<string, unknown>[],
      'id'
    );

    const farmerCount = tables.farmers ?? 0;
    await client.from('sync_meta').upsert({
      id: 'default',
      last_full_sync_at: new Date().toISOString(),
      last_sync_status: 'ok',
      farmers_count: farmerCount,
      updated_at: new Date().toISOString(),
    });

    return { ok: true, tables, durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await client.from('sync_meta').upsert({
        id: 'default',
        last_sync_status: `error: ${message}`,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignore meta update failure
    }
    return { ok: false, error: message, tables, durationMs: Date.now() - start };
  }
}

/** Fire-and-forget sync — does not block API responses */
export function scheduleSupabaseSync(reason?: string): void {
  if (!isSupabaseConfigured()) return;
  setImmediate(() => {
    syncAllToSupabase().then((result) => {
      if (result.ok) {
        console.log(`Supabase sync complete (${reason ?? 'scheduled'}):`, result.tables);
      } else {
        console.warn(`Supabase sync failed (${reason ?? 'scheduled'}):`, result.error);
      }
    });
  });
}

export async function getSupabaseSyncStatus(): Promise<{
  configured: boolean;
  remote?: {
    last_full_sync_at: string | null;
    last_sync_status: string | null;
    farmers_count: number | null;
  };
}> {
  const configured = isSupabaseConfigured();
  if (!configured) return { configured: false };

  const client = getSupabaseAdmin();
  if (!client) return { configured: false };

  const { data, error } = await client.from('sync_meta').select('*').eq('id', 'default').maybeSingle();
  if (error || !data) {
    return { configured: true, remote: { last_full_sync_at: null, last_sync_status: error?.message ?? null, farmers_count: null } };
  }
  return {
    configured: true,
    remote: {
      last_full_sync_at: data.last_full_sync_at as string | null,
      last_sync_status: data.last_sync_status as string | null,
      farmers_count: data.farmers_count as number | null,
    },
  };
}
