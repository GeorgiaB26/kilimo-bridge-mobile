import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { buildLocationPath } from '../../../shared/src/regional';
import { PENDING_LOCATION_LABEL } from '../../../shared/src/constants';
import { isAdminRole, isRegionalAdminRole } from '../../../shared/src/roles';

export type CustomLocationStatus = 'pending' | 'verified' | 'rejected';

export type CustomLocationRow = {
  id: string;
  country: string;
  level_1: string;
  level_2: string;
  level_3: string | null;
  level_4: string;
  location_path: string;
  status: CustomLocationStatus;
  source: string;
  created_by_user_id: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505');
}

/**
 * Village overlay (level_4 only). Parish/ward and program hierarchy are out of scope.
 * Runtime DDL matches backend/migrations/013_custom_locations.sql so Render/local
 * get the table without a separate migrate step. RLS applies to PostgREST/Lovable only;
 * Express connects as postgres and bypasses it.
 */
export async function ensureCustomLocationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS custom_locations (
      id TEXT PRIMARY KEY,
      country TEXT NOT NULL,
      level_1 TEXT NOT NULL,
      level_2 TEXT NOT NULL,
      level_3 TEXT,
      level_4 TEXT NOT NULL,
      location_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected')),
      source TEXT NOT NULL DEFAULT 'registration'
        CHECK (source IN ('registration', 'portal')),
      created_by_user_id TEXT,
      verified_by_user_id TEXT,
      verified_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS custom_locations_path_unique
      ON custom_locations (
        lower(country),
        lower(level_1),
        lower(level_2),
        lower(COALESCE(level_3, '')),
        lower(level_4)
      )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS custom_locations_status_l1
      ON custom_locations (status, country, level_1)
  `);

  await query(`
    CREATE OR REPLACE FUNCTION custom_locations_role()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT role::text FROM users WHERE user_id = auth.uid() LIMIT 1;
    $$
  `);
  await query(`
    CREATE OR REPLACE FUNCTION custom_locations_district()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT district FROM users WHERE user_id = auth.uid() LIMIT 1;
    $$
  `);
  await query(`REVOKE ALL ON FUNCTION custom_locations_role() FROM PUBLIC`);
  await query(`REVOKE ALL ON FUNCTION custom_locations_district() FROM PUBLIC`);

  await query(`ALTER TABLE custom_locations ENABLE ROW LEVEL SECURITY`);

  await query(`DROP POLICY IF EXISTS custom_locations_select ON custom_locations`);
  await query(`
    CREATE POLICY custom_locations_select
      ON custom_locations
      FOR SELECT
      TO authenticated
      USING (
        custom_locations_role() IN ('platform_admin', 'super_admin')
        OR (
          custom_locations_role() = 'admin'
          AND lower(trim(level_1)) = lower(trim(COALESCE(custom_locations_district(), '')))
        )
      )
  `);

  await query(`DROP POLICY IF EXISTS custom_locations_insert ON custom_locations`);
  await query(`
    CREATE POLICY custom_locations_insert
      ON custom_locations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        custom_locations_role() IN ('platform_admin', 'super_admin', 'admin')
        AND (created_by_user_id IS NULL OR created_by_user_id = auth.uid()::text)
        AND (
          custom_locations_role() IN ('platform_admin', 'super_admin')
          OR lower(trim(level_1)) = lower(trim(COALESCE(custom_locations_district(), '')))
        )
      )
  `);

  await query(`DROP POLICY IF EXISTS custom_locations_update ON custom_locations`);
  await query(`
    CREATE POLICY custom_locations_update
      ON custom_locations
      FOR UPDATE
      TO authenticated
      USING (
        custom_locations_role() IN ('platform_admin', 'super_admin')
        OR (
          custom_locations_role() = 'admin'
          AND lower(trim(level_1)) = lower(trim(COALESCE(custom_locations_district(), '')))
        )
      )
      WITH CHECK (
        custom_locations_role() IN ('platform_admin', 'super_admin')
        OR (
          custom_locations_role() = 'admin'
          AND lower(trim(level_1)) = lower(trim(COALESCE(custom_locations_district(), '')))
        )
      )
  `);

  await query(`DROP POLICY IF EXISTS custom_locations_delete ON custom_locations`);
  await query(`
    CREATE POLICY custom_locations_delete
      ON custom_locations
      FOR DELETE
      TO authenticated
      USING (custom_locations_role() IN ('platform_admin', 'super_admin'))
  `);

  await query(`
    DO $grants$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE custom_locations TO authenticated;
        GRANT EXECUTE ON FUNCTION custom_locations_role() TO authenticated;
        GRANT EXECUTE ON FUNCTION custom_locations_district() TO authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE custom_locations FROM anon;
      END IF;
    END
    $grants$
  `);
}

export async function listVerifiedVillages(params: {
  country: string;
  level1: string;
  level2: string;
  level3?: string;
}): Promise<string[]> {
  const country = normalizePart(params.country);
  const level1 = normalizePart(params.level1);
  const level2 = normalizePart(params.level2);
  const level3 = params.level3?.trim() ? normalizePart(params.level3) : '';
  if (!country || !level1 || !level2) return [];

  const rows = await query<{ level_4: string }>(
    `SELECT level_4 FROM custom_locations
     WHERE status = 'verified'
       AND lower(country) = lower($1)
       AND lower(level_1) = lower($2)
       AND lower(level_2) = lower($3)
       AND lower(COALESCE(level_3, '')) = lower($4)
     ORDER BY lower(level_4)`,
    [country, level1, level2, level3]
  );
  return rows.map((row) => row.level_4);
}

/**
 * Queue a village from farmer registration. Never throws to the caller —
 * the farmer row already stores the text. Verified names are left alone.
 * Rejected names reopen as pending.
 */
export async function upsertVillageFromRegistration(params: {
  country?: string | null;
  level1?: string | null;
  level2?: string | null;
  level3?: string | null;
  village?: string | null;
  createdByUserId?: string | null;
}): Promise<void> {
  const village = params.village ? normalizePart(params.village) : '';
  const country = params.country ? normalizePart(params.country) : '';
  const level1 = params.level1 ? normalizePart(params.level1) : '';
  const level2 = params.level2 ? normalizePart(params.level2) : '';
  if (!village || !country || !level1 || !level2) return;
  if (level1 === PENDING_LOCATION_LABEL || level2 === PENDING_LOCATION_LABEL) return;

  const level3 = params.level3?.trim() ? normalizePart(params.level3) : null;
  const path = buildLocationPath(country, level1, level2, level3 ?? undefined, village);
  const createdBy = params.createdByUserId?.trim() || null;

  const existing = await queryOne<{ id: string; status: CustomLocationStatus }>(
    `SELECT id, status FROM custom_locations
     WHERE lower(country) = lower($1)
       AND lower(level_1) = lower($2)
       AND lower(level_2) = lower($3)
       AND lower(COALESCE(level_3, '')) = lower($4)
       AND lower(level_4) = lower($5)`,
    [country, level1, level2, level3 ?? '', village]
  );

  if (existing?.status === 'verified' || existing?.status === 'pending') return;

  if (existing?.status === 'rejected') {
    await query(
      `UPDATE custom_locations
       SET status = 'pending',
           rejection_reason = NULL,
           verified_by_user_id = NULL,
           verified_at = NULL,
           source = 'registration',
           created_by_user_id = COALESCE(created_by_user_id, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [existing.id, createdBy]
    );
    return;
  }

  try {
    await query(
      `INSERT INTO custom_locations (
        id, country, level_1, level_2, level_3, level_4, location_path,
        status, source, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'registration', $8)`,
      [uuidv4(), country, level1, level2, level3, village, path, createdBy]
    );
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await queryOne<{ id: string; status: CustomLocationStatus }>(
      `SELECT id, status FROM custom_locations
       WHERE lower(country) = lower($1)
         AND lower(level_1) = lower($2)
         AND lower(level_2) = lower($3)
         AND lower(COALESCE(level_3, '')) = lower($4)
         AND lower(level_4) = lower($5)`,
      [country, level1, level2, level3 ?? '', village]
    );
    if (raced?.status === 'rejected') {
      await query(
        `UPDATE custom_locations
         SET status = 'pending',
             rejection_reason = NULL,
             verified_by_user_id = NULL,
             verified_at = NULL,
             source = 'registration',
             created_by_user_id = COALESCE(created_by_user_id, $2),
             updated_at = NOW()
         WHERE id = $1`,
        [raced.id, createdBy]
      );
    }
  }
}

export async function listAdminCustomLocations(params: {
  status?: CustomLocationStatus | 'all';
  role: string;
  district?: string | null;
}): Promise<CustomLocationRow[]> {
  const status = params.status && params.status !== 'all' ? params.status : 'pending';
  const clauses = ['status = $1'];
  const values: unknown[] = [status];
  if (isRegionalAdminRole(params.role)) {
    const district = params.district?.trim();
    if (!district) return [];
    clauses.push(`lower(trim(level_1)) = lower(trim($${values.length + 1}))`);
    values.push(district);
  }
  return query<CustomLocationRow>(
    `SELECT id, country, level_1, level_2, level_3, level_4, location_path,
            status, source, created_by_user_id, verified_by_user_id, verified_at,
            rejection_reason, created_at, updated_at
     FROM custom_locations
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC`,
    values
  );
}

export async function reviewCustomLocation(params: {
  id: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string | null;
  reviewerUserId: string;
  reviewerRole: string;
  reviewerDistrict?: string | null;
}): Promise<CustomLocationRow> {
  if (!isAdminRole(params.reviewerRole)) {
    throw new Error('Only platform, super, and regional admins can review villages');
  }
  const row = await queryOne<CustomLocationRow>(
    `SELECT id, country, level_1, level_2, level_3, level_4, location_path,
            status, source, created_by_user_id, verified_by_user_id, verified_at,
            rejection_reason, created_at, updated_at
     FROM custom_locations WHERE id = $1`,
    [params.id]
  );
  if (!row) throw new Error('Village submission not found');
  if (isRegionalAdminRole(params.reviewerRole)) {
    const district = params.reviewerDistrict?.trim() ?? '';
    if (!district || district.toLowerCase() !== row.level_1.trim().toLowerCase()) {
      throw new Error('Village is outside your assigned district');
    }
  }

  const reason =
    params.status === 'rejected' ? params.rejectionReason?.trim() || null : null;
  const updated = await queryOne<CustomLocationRow>(
    `UPDATE custom_locations
     SET status = $2,
         verified_by_user_id = $3,
         verified_at = NOW(),
         rejection_reason = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, country, level_1, level_2, level_3, level_4, location_path,
               status, source, created_by_user_id, verified_by_user_id, verified_at,
               rejection_reason, created_at, updated_at`,
    [params.id, params.status, params.reviewerUserId, reason]
  );
  if (!updated) throw new Error('Village submission not found');
  return updated;
}
