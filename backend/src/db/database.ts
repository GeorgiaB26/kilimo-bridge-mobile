import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'kilimo.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_groups (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS farmers (
      farmer_id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      id_number TEXT UNIQUE NOT NULL,
      membership_group_id TEXT NOT NULL,
      aggregation_center TEXT,
      phone_number TEXT UNIQUE NOT NULL,
      country TEXT DEFAULT 'Kenya',
      district TEXT NOT NULL,
      sub_county TEXT NOT NULL,
      parish TEXT,
      village TEXT,
      membership_type TEXT DEFAULT 'Active',
      occupation TEXT,
      size_of_land REAL,
      picture_url TEXT,
      project_1 TEXT,
      project_2 TEXT,
      project_3 TEXT,
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (membership_group_id) REFERENCES membership_groups(id)
    );

    CREATE TABLE IF NOT EXISTS import_sessions (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      total_rows INTEGER DEFAULT 0,
      valid_rows INTEGER DEFAULT 0,
      invalid_rows INTEGER DEFAULT 0,
      duplicates INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      data TEXT,
      errors TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone_number);
    CREATE INDEX IF NOT EXISTS idx_farmers_district ON farmers(district);
    CREATE INDEX IF NOT EXISTS idx_farmers_key ON farmers(key);
    CREATE INDEX IF NOT EXISTS idx_farmers_id_number ON farmers(id_number);

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      phone_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      farmer_id TEXT,
      district TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS farmer_projects (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      payment_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Assigned',
      completion_percentage INTEGER DEFAULT 0,
      earnings_amount INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'Pending',
      start_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      farmer_project_id TEXT,
      project_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'KES',
      payment_method TEXT DEFAULT 'M-Pesa',
      payment_status TEXT DEFAULT 'Pending',
      mpesa_reference TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_farmer_projects_farmer ON farmer_projects(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_farmer ON payments(farmer_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      success INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      agent_id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      government_id_encrypted TEXT NOT NULL,
      aggregation_center TEXT NOT NULL,
      region TEXT NOT NULL,
      district TEXT NOT NULL,
      status TEXT DEFAULT 'pending_verification',
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      payment_id TEXT,
      farmer_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'KES',
      recipient_phone TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      equity_reference TEXT,
      equity_response TEXT,
      error_message TEXT,
      initiated_by TEXT,
      webhook_received_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
    );

    CREATE TABLE IF NOT EXISTS payment_verifications (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      agent_user_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (agent_user_id) REFERENCES users(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(category);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_agents_region ON agents(region);
    CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON bank_transactions(status);
  `);

  runMigrations();
}

function runMigrations(): void {
  const addColumn = (table: string, column: string, definition: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch {
      // column exists
    }
  };

  addColumn('users', 'password_hash', 'TEXT');
  addColumn('users', 'region', 'TEXT');
  addColumn('users', 'aggregation_center', 'TEXT');

  migrateUsersTableIfNeeded();

  addColumn('farmers', 'id_number_encrypted', 'TEXT');
  addColumn('farmers', 'bank_account_encrypted', 'TEXT');
  addColumn('farmers', 'registered_by_agent_id', 'TEXT');
  addColumn('farmers', 'kb_farmer_id', 'TEXT');
  addColumn('farmers', 'location_path', 'TEXT');
  addColumn('farmers', 'location_level_1', 'TEXT');
  addColumn('farmers', 'location_level_2', 'TEXT');
  addColumn('farmers', 'location_level_3', 'TEXT');
  addColumn('farmers', 'location_level_4', 'TEXT');
  addColumn('farmers', 'phone_country_prefix', 'TEXT');
  addColumn('payments', 'processed_by', 'TEXT');
  addColumn('payments', 'verification_status', "TEXT DEFAULT 'unverified'");

  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_farmers_kb_id ON farmers(kb_farmer_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_farmers_country ON farmers(country, location_level_1)');
  } catch {
    // index exists
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        location_id TEXT PRIMARY KEY,
        country TEXT NOT NULL,
        level_1 TEXT,
        level_2 TEXT,
        level_3 TEXT,
        level_4 TEXT,
        location_path TEXT,
        aggregation_centers_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country, level_1, level_2);

      CREATE TABLE IF NOT EXISTS aggregation_centres (
        centre_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        location_level_1 TEXT NOT NULL,
        location_level_2 TEXT,
        region TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agg_centres_country ON aggregation_centres(country, location_level_1);
    `);
  } catch {
    // table exists
  }
}

/** Recreate users table when legacy CHECK constraint blocks agent/banking roles */
function migrateUsersTableIfNeeded(): void {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as
    | { sql: string }
    | undefined;
  if (!row?.sql) return;

  const needsMigration =
    row.sql.includes('CHECK') ||
    row.sql.includes('field_officer');

  if (!needsMigration) return;

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      CREATE TABLE users_new (
        user_id TEXT PRIMARY KEY,
        phone_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        farmer_id TEXT,
        district TEXT,
        status TEXT DEFAULT 'active',
        password_hash TEXT,
        region TEXT,
        aggregation_center TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
      );

      INSERT INTO users_new (
        user_id, phone_number, name, role, farmer_id, district, status,
        password_hash, region, aggregation_center, created_at, updated_at
      )
      SELECT
        user_id, phone_number, name,
        CASE WHEN role = 'field_officer' THEN 'agent' ELSE role END,
        farmer_id, district, status,
        password_hash, region, aggregation_center, created_at, updated_at
      FROM users;

      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;

      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);
  } finally {
    db.pragma('foreign_keys = ON');
  }
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
