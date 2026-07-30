/** Local SQLite schema for offline cache (Android/iOS). */

export const LOCAL_DB_NAME = 'kilimo_local.db';

export const CREATE_LOCAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS farmers (
  farmer_id TEXT PRIMARY KEY,
  key TEXT,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  country TEXT,
  district TEXT,
  sub_county TEXT,
  aggregation_center TEXT,
  membership_group_name TEXT,
  status TEXT,
  kb_farmer_id TEXT,
  updated_at TEXT,
  pending_sync INTEGER DEFAULT 0,
  sync_error TEXT,
  last_sync_attempt TEXT,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS farmer_tasks (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  farmer_id TEXT,
  program_project_id TEXT,
  status TEXT,
  payment_value_kes INTEGER,
  notes TEXT,
  updated_at TEXT,
  pending_sync INTEGER DEFAULT 0,
  sync_error TEXT,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sync_attempt TEXT,
  sync_error TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_farmers_phone ON farmers(phone_number);
CREATE INDEX IF NOT EXISTS idx_local_farmers_pending ON farmers(pending_sync);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
`;

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'idle';

export interface SyncState {
  status: SyncStatus;
  message: string;
  lastSyncAt: string | null;
  pendingCount: number;
}
