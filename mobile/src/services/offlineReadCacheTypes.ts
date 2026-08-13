/**
 * Shared types / key helpers for the offline read cache.
 * Native: SQLite `read_cache` in kilimo_offline.db
 * Web: AsyncStorage `kilimo_read_cache_v1`
 */

export interface ReadCacheEntry<T = unknown> {
  cacheKey: string;
  userScope: string;
  payload: T;
  fetchedAt: string;
}

export const READ_CACHE_KEYS = {
  farmerDashboard: 'farmer:dashboard',
  farmerProjects: 'farmer:projects',
  farmerTasks: (programProjectId: string) => `farmer:tasks:${programProjectId}`,
  agentFarmers: 'agent:farmers',
  agentDashboard: 'agent:dashboard',
  agentTasks: 'agent:tasks',
  farmerPayments: 'farmer:payments',
  messageThreads: 'messages:threads',
  adminDashboard: 'admin:dashboard',
  adminFarmers: 'admin:farmers',
  adminFarmerDetail: (farmerId: string) => `admin:farmer:${farmerId}`,
  adminTasks: 'admin:tasks',
} as const;

export function readCacheCompositeKey(userScope: string, cacheKey: string): string {
  return `${userScope.trim() || 'anon'}::${cacheKey}`;
}

/** Human label for “Showing offline data from …” */
export function formatOfflineCacheTime(fetchedAt: string): string {
  const d = new Date(fetchedAt);
  if (Number.isNaN(d.getTime())) return fetchedAt;
  return d.toLocaleString();
}

/** Exact user-facing indicator copy (for UI + proofs). */
export function offlineCacheBannerText(fetchedAt: string): string {
  return `Showing offline data from ${formatOfflineCacheTime(fetchedAt)}`;
}
