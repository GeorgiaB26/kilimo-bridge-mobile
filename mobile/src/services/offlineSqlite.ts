/**
 * Shared native SQLite connection for kilimo_offline.db.
 *
 * offlineReadCache, offlineOutbox, and offlineRegistrationQueue must use this
 * module instead of opening independent connections — concurrent opens caused
 * prepareAsync NullPointerException on Android.
 */
import { Platform } from 'react-native';

export const OFFLINE_DB_NAME = 'kilimo_offline.db';

export type OfflineSqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  getAllAsync: <T>(sql: string, params?: (string | number | null)[]) => Promise<T[]>;
  runAsync: (sql: string, params?: (string | number | null)[]) => Promise<unknown>;
};

const OFFLINE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS read_cache (
    composite_key TEXT PRIMARY KEY NOT NULL,
    cache_key TEXT NOT NULL,
    user_scope TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_read_cache_scope
    ON read_cache (user_scope);

  CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY NOT NULL,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    photo_local_uri TEXT,
    photo_base64 TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_next
    ON sync_outbox (status, next_attempt_at);
  CREATE INDEX IF NOT EXISTS idx_sync_outbox_action
    ON sync_outbox (action_type);

  CREATE TABLE IF NOT EXISTS pending_registrations (
    id TEXT PRIMARY KEY NOT NULL,
    form_json TEXT NOT NULL,
    picture_base64 TEXT,
    created_at TEXT NOT NULL,
    sync_error TEXT
  );
`;

let sqliteDb: OfflineSqliteDb | null = null;
let initDone = false;
let initPromise: Promise<OfflineSqliteDb | null> | null = null;

async function openOfflineDb(): Promise<OfflineSqliteDb | null> {
  try {
    const { openDatabaseAsync } = await import('expo-sqlite');
    const database = await openDatabaseAsync(OFFLINE_DB_NAME);
    sqliteDb = database as unknown as OfflineSqliteDb;
    await database.execAsync(OFFLINE_SCHEMA_SQL);
    return sqliteDb;
  } catch {
    sqliteDb = null;
    return null;
  } finally {
    initDone = true;
    initPromise = null;
  }
}

/**
 * Returns the shared SQLite handle, or null on web / when open fails (AsyncStorage fallback).
 * Concurrent callers await the same init promise.
 */
export async function getOfflineSqliteDb(): Promise<OfflineSqliteDb | null> {
  if (Platform.OS === 'web') {
    initDone = true;
    return null;
  }
  if (initDone) return sqliteDb;
  if (!initPromise) {
    initPromise = openOfflineDb();
  }
  return initPromise;
}

/** Test helper: reset singleton between proof runs. */
export function __resetOfflineSqliteForTests(): void {
  sqliteDb = null;
  initDone = false;
  initPromise = null;
}
