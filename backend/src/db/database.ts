import { config as loadEnv } from 'dotenv';
import path from 'path';
import { Pool, type QueryResultRow } from 'pg';

loadEnv({ path: path.resolve(process.cwd(), '.env') });

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set — add it to backend/.env');
  }
  return url;
}

/** Shared Postgres pool (Supabase transaction pooler). */
export const pool = new Pool({
  connectionString: requireDatabaseUrl(),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function getFarmerCount(): Promise<number> {
  const row = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM farmers');
  return row?.count ?? 0;
}

/** Verify pool connectivity — used by scripts/test-db-connection.ts */
export async function testConnection(): Promise<{ farmerCount: number }> {
  const row = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM farmers');
  return { farmerCount: row?.count ?? 0 };
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/** Schema is managed in Supabase — no runtime DDL. */
export function initDatabase(): void {
  // no-op
}

export interface FarmerRow {
  farmer_id: string;
  key: string;
  name: string;
  gender: string;
  id_number: string;
  membership_group_id: string;
  aggregation_center: string | null;
  phone_number: string;
  country: string;
  district: string;
  sub_county: string;
  parish: string | null;
  village: string | null;
  membership_type: string | null;
  occupation: string | null;
  size_of_land: number | null;
  picture_url: string | null;
  project_1: string | null;
  project_2: string | null;
  project_3: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  kb_farmer_id?: string | null;
  location_path?: string | null;
  location_level_1?: string | null;
  location_level_2?: string | null;
  location_level_3?: string | null;
  location_level_4?: string | null;
  phone_country_prefix?: string | null;
}
