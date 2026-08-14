/**
 * Offline read cache (web) — AsyncStorage.
 * Same public API as the native SQLite implementation.
 */
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

const ASYNC_KEY = 'kilimo_read_cache_v1';

type StoreMap = Record<
  string,
  { cacheKey: string; userScope: string; payload_json: string; fetched_at: string }
>;

async function loadStore(): Promise<StoreMap> {
  const raw = await AsyncStorage.getItem(ASYNC_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoreMap;
  } catch {
    return {};
  }
}

async function saveStore(store: StoreMap): Promise<void> {
  await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(store));
}

export async function putReadCache<T>(
  cacheKey: string,
  payload: T,
  userScope: string
): Promise<ReadCacheEntry<T>> {
  const fetchedAt = new Date().toISOString();
  const scope = userScope.trim() || 'anon';
  const key = readCacheCompositeKey(scope, cacheKey);
  const store = await loadStore();
  store[key] = {
    cacheKey,
    userScope: scope,
    payload_json: JSON.stringify(payload ?? null),
    fetched_at: fetchedAt,
  };
  await saveStore(store);
  return { cacheKey, userScope: scope, payload, fetchedAt };
}

export async function getReadCache<T>(
  cacheKey: string,
  userScope: string
): Promise<ReadCacheEntry<T> | null> {
  const scope = userScope.trim() || 'anon';
  const key = readCacheCompositeKey(scope, cacheKey);
  const store = await loadStore();
  const row = store[key];
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

export async function deleteReadCache(cacheKey: string, userScope: string): Promise<void> {
  const key = readCacheCompositeKey(userScope.trim() || 'anon', cacheKey);
  const store = await loadStore();
  if (!(key in store)) return;
  delete store[key];
  await saveStore(store);
}

export async function clearReadCacheForUser(userScope: string): Promise<number> {
  const scope = userScope.trim() || 'anon';
  const prefix = `${scope}::`;
  const store = await loadStore();
  let removed = 0;
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) {
      delete store[key];
      removed += 1;
    }
  }
  if (removed > 0) await saveStore(store);
  return removed;
}

/**
 * Try live fetch; on success write cache.
 * On failure, return last cache for this key/scope if present.
 */
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
    try {
      const cached = await getReadCache<T>(options.cacheKey, options.userScope);
      if (cached) {
        return { data: cached.payload, fromCache: true, fetchedAt: cached.fetchedAt };
      }
    } catch {
      /* Cache read failed — surface the original fetch error. */
    }
    throw err;
  }
}
