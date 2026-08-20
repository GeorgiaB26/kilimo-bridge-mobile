-- Overlay of user/staff-submitted villages on top of hardcoded LOCATION_DATA.
-- Does not replace sectors / programs / program_projects.
-- Village only (level_4). Parish/ward is out of scope for this pass.
--
-- Actor columns are TEXT (message_thread_* pattern). RLS compares auth.uid()::text.
-- public.users has user_id (UUID), not id. Stored roles are snake_case enum values.
-- FORCE ROW LEVEL SECURITY is intentionally off so Express (postgres owner) still bypasses RLS.

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
);

CREATE UNIQUE INDEX IF NOT EXISTS custom_locations_path_unique
  ON custom_locations (
    lower(country),
    lower(level_1),
    lower(level_2),
    lower(COALESCE(level_3, '')),
    lower(level_4)
  );

CREATE INDEX IF NOT EXISTS custom_locations_status_l1
  ON custom_locations (status, country, level_1);

CREATE OR REPLACE FUNCTION custom_locations_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM users WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION custom_locations_district()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT district FROM users WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION custom_locations_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION custom_locations_district() FROM PUBLIC;

ALTER TABLE custom_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_locations_select ON custom_locations;
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
  );

DROP POLICY IF EXISTS custom_locations_insert ON custom_locations;
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
  );

DROP POLICY IF EXISTS custom_locations_update ON custom_locations;
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
  );

DROP POLICY IF EXISTS custom_locations_delete ON custom_locations;
CREATE POLICY custom_locations_delete
  ON custom_locations
  FOR DELETE
  TO authenticated
  USING (custom_locations_role() IN ('platform_admin', 'super_admin'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE custom_locations TO authenticated;
    GRANT EXECUTE ON FUNCTION custom_locations_role() TO authenticated;
    GRANT EXECUTE ON FUNCTION custom_locations_district() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE custom_locations FROM anon;
  END IF;
END $$;
