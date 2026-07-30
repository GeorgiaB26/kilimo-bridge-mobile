-- Kilimo Bridge APP database (NEW Supabase project — NOT admin/Loveable platform)
-- Run ONLY in the dedicated App Supabase project.

-- Cooperatives (GWED / cooperative registry stub)
CREATE TABLE IF NOT EXISTS cooperatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  country VARCHAR,
  district VARCHAR,
  sub_county VARCHAR,
  government_registry_id VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS farmers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_farmer_id TEXT,
  name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL UNIQUE,
  email VARCHAR,
  country VARCHAR,
  cooperative_id UUID REFERENCES cooperatives(id),
  district VARCHAR,
  sub_county VARCHAR,
  village VARCHAR,
  gps_latitude DECIMAL(10, 7),
  gps_longitude DECIMAL(10, 7),
  land_size_acres DECIMAL(10, 2),
  land_ownership VARCHAR,
  primary_crop VARCHAR,
  years_experience INTEGER,
  occupation VARCHAR,
  membership_type VARCHAR,
  role VARCHAR,
  currency VARCHAR DEFAULT 'KES',
  language VARCHAR DEFAULT 'en',
  receive_sms BOOLEAN DEFAULT true,
  profile_photo_url TEXT,
  photo_verified_by VARCHAR,
  photo_verified_at TIMESTAMPTZ,
  cooperative_verified BOOLEAN DEFAULT false,
  status VARCHAR DEFAULT 'pending',
  activated BOOLEAN DEFAULT false,
  verified_by_name VARCHAR,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  pending_sync BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_project_id TEXT,
  name VARCHAR NOT NULL,
  description TEXT,
  sector VARCHAR,
  start_date DATE,
  end_date DATE,
  expected_yield TEXT,
  payment_terms TEXT,
  created_by UUID,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_task_id TEXT,
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR NOT NULL,
  description TEXT,
  photo_specs TEXT,
  submission_requirements TEXT,
  deadline DATE,
  created_by UUID,
  status VARCHAR DEFAULT 'pending',
  payment_amount DECIMAL(12, 2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_submission_id TEXT,
  task_id UUID NOT NULL REFERENCES tasks(id),
  farmer_id UUID NOT NULL REFERENCES farmers(id),
  photo_url TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  approval_status VARCHAR DEFAULT 'pending',
  rejected_reason TEXT,
  approved_by VARCHAR,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  pending_sync BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  farmer_id UUID NOT NULL REFERENCES farmers(id),
  assigned_at TIMESTAMPTZ,
  assigned_by VARCHAR,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  UNIQUE(project_id, farmer_id)
);

CREATE TABLE IF NOT EXISTS field_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_agent_id UUID NOT NULL,
  farmer_id UUID NOT NULL REFERENCES farmers(id),
  assigned_at TIMESTAMPTZ,
  assigned_by VARCHAR,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_payment_id TEXT,
  farmer_id UUID NOT NULL REFERENCES farmers(id),
  project_id UUID REFERENCES projects(id),
  amount DECIMAL NOT NULL,
  currency VARCHAR DEFAULT 'KES',
  payment_method VARCHAR,
  status VARCHAR DEFAULT 'pending',
  mpesa_phone VARCHAR,
  till_number VARCHAR,
  transaction_id VARCHAR,
  processed_by VARCHAR,
  processed_at TIMESTAMPTZ,
  farmer_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS field_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_agent_id UUID NOT NULL,
  farmer_id UUID NOT NULL REFERENCES farmers(id),
  task_type VARCHAR,
  description TEXT,
  due_date DATE,
  priority VARCHAR DEFAULT 'medium',
  status VARCHAR DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  notes TEXT,
  gps_latitude DECIMAL(10, 7),
  gps_longitude DECIMAL(10, 7),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  pending_sync BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_user_id TEXT,
  phone VARCHAR UNIQUE,
  email VARCHAR,
  name VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  farmer_id UUID REFERENCES farmers(id),
  field_agent_id UUID,
  district VARCHAR,
  region VARCHAR,
  cooperative_id UUID REFERENCES cooperatives(id),
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR NOT NULL,
  record_id UUID NOT NULL,
  local_updated_at TIMESTAMPTZ,
  remote_updated_at TIMESTAMPTZ,
  resolution VARCHAR DEFAULT 'pending',
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_role VARCHAR,
  action VARCHAR NOT NULL,
  resource_type VARCHAR,
  resource_id UUID,
  details JSONB,
  gps_latitude DECIMAL(10, 7),
  gps_longitude DECIMAL(10, 7),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_app_farmers_phone ON farmers(phone);
CREATE INDEX IF NOT EXISTS idx_app_farmers_status ON farmers(status);
CREATE INDEX IF NOT EXISTS idx_app_farmers_coop ON farmers(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_farmer ON task_submissions(farmer_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task ON task_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_payments_farmer ON payments(farmer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_field_agent_assignments_agent ON field_agent_assignments(field_agent_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_farmer ON project_assignments(farmer_id);

-- RLS
ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooperatives ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_role() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'userId', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_farmer_id() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'farmerId', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_phone() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'phoneNumber', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_district() RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() ->> 'district', '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_app_admin() RETURNS BOOLEAN AS $$
  SELECT app_role() IN ('admin', 'super_admin');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_field_agent() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'agent';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_banking() RETURNS BOOLEAN AS $$
  SELECT app_role() IN ('banking', 'super_admin');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_farmer() RETURNS BOOLEAN AS $$
  SELECT app_role() = 'farmer';
$$ LANGUAGE sql STABLE;

-- Farmers
CREATE POLICY app_farmers_select ON farmers FOR SELECT TO authenticated
USING (
  is_deleted = false AND (
    is_app_admin() OR is_field_agent()
    OR id::text = app_farmer_id()
    OR phone = app_phone()
  )
);

CREATE POLICY app_farmers_insert ON farmers FOR INSERT TO authenticated
WITH CHECK (is_app_admin() OR is_field_agent());

CREATE POLICY app_farmers_update ON farmers FOR UPDATE TO authenticated
USING (is_app_admin() OR is_field_agent() OR id::text = app_farmer_id());

-- Task submissions
CREATE POLICY app_submissions_select ON task_submissions FOR SELECT TO authenticated
USING (
  is_deleted = false AND (
    is_app_admin() OR is_field_agent()
    OR farmer_id::text = app_farmer_id()
  )
);

CREATE POLICY app_submissions_insert ON task_submissions FOR INSERT TO authenticated
WITH CHECK (is_app_admin() OR is_field_agent() OR farmer_id::text = app_farmer_id());

CREATE POLICY app_submissions_update ON task_submissions FOR UPDATE TO authenticated
USING (is_app_admin() OR is_field_agent() OR farmer_id::text = app_farmer_id());

-- Payments (banking + farmer own + admin)
CREATE POLICY app_payments_select ON payments FOR SELECT TO authenticated
USING (
  is_deleted = false AND (
    is_app_admin() OR is_banking() OR is_field_agent()
    OR farmer_id::text = app_farmer_id()
  )
);

CREATE POLICY app_payments_update ON payments FOR UPDATE TO authenticated
USING (is_app_admin() OR is_banking());

-- Projects & tasks read for assigned users
CREATE POLICY app_projects_select ON projects FOR SELECT TO authenticated
USING (is_deleted = false AND (is_app_admin() OR is_field_agent() OR is_farmer()));

CREATE POLICY app_tasks_select ON tasks FOR SELECT TO authenticated
USING (is_deleted = false AND (is_app_admin() OR is_field_agent() OR is_farmer()));

CREATE POLICY app_project_assignments_select ON project_assignments FOR SELECT TO authenticated
USING (is_deleted = false AND (
  is_app_admin() OR is_field_agent() OR farmer_id::text = app_farmer_id()
));

-- Field agent tasks
CREATE POLICY app_agent_tasks_select ON field_agent_tasks FOR SELECT TO authenticated
USING (is_deleted = false AND (is_app_admin() OR is_field_agent()));

CREATE POLICY app_agent_tasks_insert ON field_agent_tasks FOR INSERT TO authenticated
WITH CHECK (is_app_admin() OR is_field_agent());

CREATE POLICY app_agent_tasks_update ON field_agent_tasks FOR UPDATE TO authenticated
USING (is_app_admin() OR is_field_agent());

-- Cooperatives read
CREATE POLICY app_cooperatives_select ON cooperatives FOR SELECT TO authenticated
USING (is_deleted = false);
