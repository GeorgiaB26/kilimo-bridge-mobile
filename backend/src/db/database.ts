import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'kilimo.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

function openDatabase(): InstanceType<typeof Database> {
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}

let dbInstance = openDatabase();

/** Proxy so hot-reload after upload updates all importers using `db`. */
export const db: InstanceType<typeof Database> = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop) {
    const value = (dbInstance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(dbInstance);
    }
    return value;
  },
});

export function getDatabasePath(): string {
  return dbPath;
}

export function getFarmerCount(): number {
  const row = dbInstance.prepare('SELECT COUNT(*) as count FROM farmers').get() as { count: number };
  return row.count;
}

export function closeDatabase(): void {
  dbInstance.close();
}

/** Replace SQLite file in place and reopen — no process restart (Render free tier wipes disk on restart). */
export function replaceDatabaseFile(buffer: Buffer): number {
  dbInstance.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const p = suffix ? dbPath + suffix : dbPath;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.writeFileSync(dbPath, buffer);
  dbInstance = openDatabase();
  return getFarmerCount();
}

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

  migratePhase2Hierarchy();
}

function migratePhase2Hierarchy(): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        country TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        sector_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sector_id) REFERENCES sectors(id)
      );
      CREATE INDEX IF NOT EXISTS idx_programs_sector ON programs(sector_id);

      CREATE TABLE IF NOT EXISTS program_projects (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (program_id) REFERENCES programs(id),
        FOREIGN KEY (country_manager_id) REFERENCES users(user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_program_projects_program ON program_projects(program_id);

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        program_project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        task_order INTEGER NOT NULL,
        payment_value_kes INTEGER DEFAULT 0,
        assigned_agronomist_id TEXT,
        due_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(program_project_id);

      CREATE TABLE IF NOT EXISTS program_project_farmers (
        id TEXT PRIMARY KEY,
        program_project_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        status TEXT DEFAULT 'assigned',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(program_project_id, farmer_id),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id)
      );

      CREATE TABLE IF NOT EXISTS farmer_tasks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        program_project_id TEXT NOT NULL,
        status TEXT DEFAULT 'not-started',
        submitted_date TEXT,
        approved_date TEXT,
        completed_date TEXT,
        photo_evidence_url TEXT,
        notes TEXT,
        rejection_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(task_id, farmer_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
        FOREIGN KEY (program_project_id) REFERENCES program_projects(id)
      );
      CREATE INDEX IF NOT EXISTS idx_farmer_tasks_farmer ON farmer_tasks(farmer_id);
      CREATE INDEX IF NOT EXISTS idx_farmer_tasks_status ON farmer_tasks(status);

      CREATE TABLE IF NOT EXISTS centre_inventory (
        id TEXT PRIMARY KEY,
        centre_id TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        task_id TEXT,
        product_name TEXT NOT NULL,
        quantity_received REAL NOT NULL,
        unit TEXT DEFAULT 'kg',
        quality_status TEXT DEFAULT 'pending',
        quality_notes TEXT,
        received_date TEXT DEFAULT (datetime('now')),
        scanned_by_user_id TEXT,
        is_marketplace_ready INTEGER DEFAULT 0,
        marketplace_price_per_unit REAL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (centre_id) REFERENCES aggregation_centres(centre_id),
        FOREIGN KEY (farmer_id) REFERENCES farmers(farmer_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
      CREATE INDEX IF NOT EXISTS idx_centre_inventory_centre ON centre_inventory(centre_id);
    `);
  } catch {
    // tables exist
  }

  const addCol = (table: string, column: string, def: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    } catch {
      // exists
    }
  };
  addCol('aggregation_centres', 'manager_name', 'TEXT');
  addCol('aggregation_centres', 'manager_phone', 'TEXT');
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
