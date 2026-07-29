-- Kilimo Bridge — offline-first Supabase schema (source of truth in cloud)
-- Extends mirror tables with soft-delete + sync metadata + RLS for Kilimo JWT

-- Sync metadata columns (idempotent)
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS pending_sync BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE farmer_tasks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE program_projects ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_updated_at TEXT,
  remote_updated_at TEXT,
  resolution TEXT DEFAULT 'pending',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  table_name TEXT,
  record_count INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  device_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at);
CREATE INDEX IF NOT EXISTS idx_farmers_updated ON farmers(updated_at);
CREATE INDEX IF NOT EXISTS idx_farmer_tasks_farmer_status ON farmer_tasks(farmer_id, status);

-- Kilimo JWT helpers (claims: userId, role, farmerId, phoneNumber, district)
CREATE OR REPLACE FUNCTION kilimo_role() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION kilimo_farmer_id() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'farmerId', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION kilimo_phone() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'phoneNumber', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION kilimo_district() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'district', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION kilimo_is_admin() RETURNS BOOLEAN AS $$
  SELECT kilimo_role() IN ('admin', 'super_admin');
$$ LANGUAGE sql STABLE;

-- Drop open anon read policies from mirror migration if re-running (replace with JWT policies)
DROP POLICY IF EXISTS anon_read_farmers ON farmers;
DROP POLICY IF EXISTS anon_read_users ON users;
DROP POLICY IF EXISTS anon_read_farmer_tasks ON farmer_tasks;

-- Farmers: read
CREATE POLICY farmers_select ON farmers FOR SELECT TO authenticated
USING (
  is_deleted = false
  AND (
    kilimo_is_admin()
    OR (kilimo_role() = 'agent' AND district = kilimo_district())
    OR farmer_id = kilimo_farmer_id()
    OR phone_number = kilimo_phone()
  )
);

-- Farmers: write (admin/agent register; farmers update own row)
CREATE POLICY farmers_insert ON farmers FOR INSERT TO authenticated
WITH CHECK (kilimo_is_admin() OR kilimo_role() = 'agent');

CREATE POLICY farmers_update ON farmers FOR UPDATE TO authenticated
USING (
  is_deleted = false AND (
    kilimo_is_admin()
    OR kilimo_role() = 'agent'
    OR farmer_id = kilimo_farmer_id()
  )
);

-- Farmer tasks
CREATE POLICY farmer_tasks_select ON farmer_tasks FOR SELECT TO authenticated
USING (
  is_deleted = false
  AND (
    kilimo_is_admin()
    OR kilimo_role() = 'agent'
    OR farmer_id = kilimo_farmer_id()
  )
);

CREATE POLICY farmer_tasks_insert ON farmer_tasks FOR INSERT TO authenticated
WITH CHECK (kilimo_is_admin() OR farmer_id = kilimo_farmer_id() OR kilimo_role() = 'agent');

CREATE POLICY farmer_tasks_update ON farmer_tasks FOR UPDATE TO authenticated
USING (kilimo_is_admin() OR farmer_id = kilimo_farmer_id() OR kilimo_role() = 'agent');

-- Tasks read for enrolled farmers
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
USING (kilimo_is_admin() OR kilimo_role() IN ('agent', 'farmer'));

-- Payments
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
USING (
  is_deleted = false
  AND (kilimo_is_admin() OR farmer_id = kilimo_farmer_id() OR kilimo_role() IN ('banking', 'agent'))
);

-- Service role bypasses RLS — used by migration script only
