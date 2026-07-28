-- Kilimo Bridge — Supabase mirror schema (synced from SQLite via Express API)
-- Run in Supabase SQL Editor or: supabase db push
-- Writes go to SQLite first; backend sync service upserts rows here for the web portal.

CREATE TABLE IF NOT EXISTS sync_meta (
  id TEXT PRIMARY KEY DEFAULT 'default',
  last_full_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  farmers_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sync_meta (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS membership_groups (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farmers (
  farmer_id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  id_number TEXT,
  membership_group_id TEXT REFERENCES membership_groups(id),
  membership_group_name TEXT,
  aggregation_center TEXT,
  phone_number TEXT UNIQUE NOT NULL,
  country TEXT DEFAULT 'Kenya',
  district TEXT NOT NULL,
  sub_county TEXT NOT NULL,
  parish TEXT,
  village TEXT,
  membership_type TEXT,
  occupation TEXT,
  size_of_land DOUBLE PRECISION,
  picture_url TEXT,
  project_1 TEXT,
  project_2 TEXT,
  project_3 TEXT,
  status TEXT DEFAULT 'Active',
  kb_farmer_id TEXT,
  location_path TEXT,
  location_level_1 TEXT,
  location_level_2 TEXT,
  location_level_3 TEXT,
  location_level_4 TEXT,
  phone_country_prefix TEXT,
  registered_by_agent_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mirror_farmers_phone ON farmers(phone_number);
CREATE INDEX IF NOT EXISTS idx_mirror_farmers_district ON farmers(district);
CREATE INDEX IF NOT EXISTS idx_mirror_farmers_country ON farmers(country, location_level_1);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  farmer_id TEXT,
  district TEXT,
  region TEXT,
  aggregation_center TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mirror_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_mirror_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  country TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  sector_id TEXT REFERENCES sectors(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  budget_kes INTEGER,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_projects (
  id TEXT PRIMARY KEY,
  program_id TEXT REFERENCES programs(id),
  name TEXT NOT NULL,
  region TEXT,
  budget_kes INTEGER,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'active',
  country_manager_id TEXT,
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  is_test INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  program_project_id TEXT REFERENCES program_projects(id),
  name TEXT NOT NULL,
  description TEXT,
  task_order INTEGER NOT NULL,
  payment_value_kes INTEGER DEFAULT 0,
  assigned_agronomist_id TEXT,
  due_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_project_farmers (
  id TEXT PRIMARY KEY,
  program_project_id TEXT REFERENCES program_projects(id),
  farmer_id TEXT REFERENCES farmers(farmer_id),
  status TEXT DEFAULT 'assigned',
  created_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_project_id, farmer_id)
);

CREATE TABLE IF NOT EXISTS farmer_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  farmer_id TEXT REFERENCES farmers(farmer_id),
  program_project_id TEXT REFERENCES program_projects(id),
  status TEXT DEFAULT 'not-started',
  submitted_date TEXT,
  approved_date TEXT,
  completed_date TEXT,
  photo_evidence_url TEXT,
  notes TEXT,
  rejection_reason TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, farmer_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  farmer_id TEXT REFERENCES farmers(farmer_id),
  farmer_project_id TEXT,
  project_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'KES',
  payment_method TEXT DEFAULT 'M-Pesa',
  payment_status TEXT DEFAULT 'Pending',
  mpesa_reference TEXT,
  verification_status TEXT,
  created_at TEXT,
  paid_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aggregation_centres (
  centre_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  location_level_1 TEXT NOT NULL,
  location_level_2 TEXT,
  region TEXT,
  manager_name TEXT,
  manager_phone TEXT,
  status TEXT DEFAULT 'Active',
  created_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_sessions (
  id TEXT PRIMARY KEY,
  status TEXT,
  total_rows INTEGER DEFAULT 0,
  valid_rows INTEGER DEFAULT 0,
  invalid_rows INTEGER DEFAULT 0,
  duplicates INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  created_at TEXT,
  completed_at TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Read-only mirror for portal + mobile online reads. Writes only via service role (backend sync).
ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_project_farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aggregation_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_farmers" ON farmers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_users" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_membership_groups" ON membership_groups FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_projects" ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sectors" ON sectors FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_programs" ON programs FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_program_projects" ON program_projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_tasks" ON tasks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_program_project_farmers" ON program_project_farmers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_farmer_tasks" ON farmer_tasks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_payments" ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_aggregation_centres" ON aggregation_centres FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_import_sessions" ON import_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_sync_meta" ON sync_meta FOR SELECT TO anon USING (true);

-- Dashboard view for Supabase Table Editor / web portal
CREATE OR REPLACE VIEW portal_dashboard AS
SELECT
  (SELECT COUNT(*) FROM farmers) AS farmers_count,
  (SELECT COUNT(*) FROM users WHERE role IN ('admin', 'super_admin')) AS admin_count,
  (SELECT COUNT(*) FROM program_projects WHERE status = 'active') AS active_projects,
  (SELECT COUNT(*) FROM farmer_tasks WHERE status IN ('submitted', 'approved')) AS pending_tasks,
  (SELECT last_full_sync_at FROM sync_meta WHERE id = 'default') AS last_sync_at;
