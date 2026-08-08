/**
 * Offline read cache (web) — live API only.
 * Avoids localStorage quota errors from kilimo_read_cache_v1 on Netlify.
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

const LEGACY_CACHE_KEY = 'kilimo_read_cache_v1';

let legacyCachePurged = false;

async function purgeLegacyWebCache(): Promise<void> {
  if (legacyCachePurged) return;
  legacyCachePurged = true;
  try {
    await AsyncStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // ignore
  }
}

/** Web does not persist read cache — prevents localStorage quota exceeded errors. */
export async function putReadCache<T>(
  cacheKey: string,
  payload: T,
  userScope: string
): Promise<ReadCacheEntry<T>> {
  await purgeLegacyWebCache();
  const fetchedAt = new Date().toISOString();
  const scope = userScope.trim() || 'anon';
  return { cacheKey, userScope: scope, payload, fetchedAt };
}

export async function getReadCache<T>(
  _cacheKey: string,
  _userScope: string
): Promise<ReadCacheEntry<T> | null> {
  await purgeLegacyWebCache();
  return null;
}

export async function deleteReadCache(_cacheKey: string, _userScope: string): Promise<void> {
  await purgeLegacyWebCache();
}

export async function clearReadCacheForUser(_userScope: string): Promise<number> {
  await purgeLegacyWebCache();
  return 0;
}

/** Direct live fetch on web — no localStorage caching. */
export async function loadWithReadCache<T>(options: {
  cacheKey: string;
  userScope: string;
  fetchLive: () => Promise<T>;
}): Promise<{ data: T; fromCache: boolean; fetchedAt: string | null }> {
  await purgeLegacyWebCache();
  const data = await options.fetchLive();
  return { data, fromCache: false, fetchedAt: null };
}
