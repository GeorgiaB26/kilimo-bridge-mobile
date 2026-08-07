/**
 * Offline read cache (native) — SQLite table `read_cache` in kilimo_offline.db.
 * Falls back to AsyncStorage if SQLite is unavailable.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readCacheCompositeKey,
  type ReadCacheEntry,
} from './offlineReadCacheTypes';

export type { ReadCacheEntry } from './offlineReadCacheTypes';
export {
  READ_CACHE_KEYS,
  formatOfflineCacheTime,
  offlineCacheBannerText,
  readCacheCompositeKey,
} from './offlineReadCacheTypes';

const DB_NAME = 'kilimo_offline.db';
const ASYNC_FALLBACK_KEY = 'kilimo_read_cache_v1';

type OfflineSqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  getAllAsync: <T>(sql: string, params?: (string | number | null)[]) => Promise<T[]>;
  runAsync: (sql: string, params?: (string | number | null)[]) => Promise<unknown>;
};

type CacheRow = {
  composite_key: string;
  cache_key: string;
  user_scope: string;
  payload_json: string;
  fetched_at: string;
};

type StoreMap = Record<
  string,
  { cacheKey: string; userScope: string; payload_json: string; fetched_at: string }
>;

let dbReady = false;
let sqliteDb: OfflineSqliteDb | null = null;

async function initDb(): Promise<void> {
  if (dbReady) return;
  if (Platform.OS === 'web') {
    dbReady = true;
    return;
  }
  try {
    const { openDatabaseAsync } = await import('expo-sqlite');
    const database = await openDatabaseAsync(DB_NAME);
    sqliteDb = database as unknown as OfflineSqliteDb;
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS read_cache (
        composite_key TEXT PRIMARY KEY NOT NULL,
        cache_key TEXT NOT NULL,
        user_scope TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_read_cache_scope
        ON read_cache (user_scope);
    `);
  } catch {
    sqliteDb = null;
  }
  dbReady = true;
}

async function loadAsyncStore(): Promise<StoreMap> {
  const raw = await AsyncStorage.getItem(ASYNC_FALLBACK_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoreMap;
  } catch {
    return {};
  }
}

async function saveAsyncStore(store: StoreMap): Promise<void> {
  await AsyncStorage.setItem(ASYNC_FALLBACK_KEY, JSON.stringify(store));
}

function rowToEntry<T>(row: CacheRow): ReadCacheEntry<T> {
  return {
    cacheKey: row.cache_key,
    userScope: row.user_scope,
    payload: JSON.parse(row.payload_json) as T,
    fetchedAt: row.fetched_at,
  };
}

export async function putReadCache<T>(
  cacheKey: string,
  payload: T,
  userScope: string
): Promise<ReadCacheEntry<T>> {
  await initDb();
  const fetchedAt = new Date().toISOString();
  const scope = userScope.trim() || 'anon';
  const composite = readCacheCompositeKey(scope, cacheKey);
  const payloadJson = JSON.stringify(payload ?? null);

  if (!sqliteDb) {
    const store = await loadAsyncStore();
    store[composite] = {
      cacheKey,
      userScope: scope,
      payload_json: payloadJson,
      fetched_at: fetchedAt,
    };
    await saveAsyncStore(store);
    return { cacheKey, userScope: scope, payload, fetchedAt };
  }

  await sqliteDb.runAsync(
    `INSERT OR REPLACE INTO read_cache
      (composite_key, cache_key, user_scope, payload_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
    [composite, cacheKey, scope, payloadJson, fetchedAt]
  );
  return { cacheKey, userScope: scope, payload, fetchedAt };
}

export async function getReadCache<T>(
  cacheKey: string,
  userScope: string
): Promise<ReadCacheEntry<T> | null> {
  await initDb();
  const scope = userScope.trim() || 'anon';
  const composite = readCacheCompositeKey(scope, cacheKey);

  if (!sqliteDb) {
    const store = await loadAsyncStore();
    const row = store[composite];
    if (!row) return null;
    try {
      return {
        cacheKey: row.cacheKey,
        userScope: row.userScope,
        payload: JSON.parse(row.payload_json) as T,
        fetchedAt: row.fetched_at,
      };
    } catch {
      return null;
    }
  }

  const rows = await sqliteDb.getAllAsync<CacheRow>(
    `SELECT composite_key, cache_key, user_scope, payload_json, fetched_at
     FROM read_cache WHERE composite_key = ? LIMIT 1`,
    [composite]
  );
  const row = rows[0];
  if (!row) return null;
  try {
    return rowToEntry<T>(row);
  } catch {
    return null;
  }
}

export async function deleteReadCache(cacheKey: string, userScope: string): Promise<void> {
  await initDb();
  const composite = readCacheCompositeKey(userScope.trim() || 'anon', cacheKey);
  if (!sqliteDb) {
    const store = await loadAsyncStore();
    if (composite in store) {
      delete store[composite];
      await saveAsyncStore(store);
    }
    return;
  }
  await sqliteDb.runAsync(`DELETE FROM read_cache WHERE composite_key = ?`, [composite]);
}

export async function clearReadCacheForUser(userScope: string): Promise<number> {
  await initDb();
  const scope = userScope.trim() || 'anon';
  if (!sqliteDb) {
    const store = await loadAsyncStore();
    const prefix = `${scope}::`;
    let removed = 0;
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        delete store[key];
        removed += 1;
      }
    }
    if (removed > 0) await saveAsyncStore(store);
    return removed;
  }
  const before = await sqliteDb.getAllAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM read_cache WHERE user_scope = ?`,
    [scope]
  );
  await sqliteDb.runAsync(`DELETE FROM read_cache WHERE user_scope = ?`, [scope]);
  return Number(before[0]?.c) || 0;
}

export async function loadWithReadCache<T>(options: {
  cacheKey: string;
  userScope: string;
  fetchLive: () => Promise<T>;
}): Promise<{ data: T; fromCache: boolean; fetchedAt: string | null }> {
  try {
    const data = await options.fetchLive();
    const saved = await putReadCache(options.cacheKey, data, options.userScope);
    return { data, fromCache: false, fetchedAt: saved.fetchedAt };
  } catch (err) {
    const cached = await getReadCache<T>(options.cacheKey, options.userScope);
    if (cached) {
      return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt };
    }
    throw err;
  }
}
