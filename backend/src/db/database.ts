import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '..', 'data');
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
  `);
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
}
