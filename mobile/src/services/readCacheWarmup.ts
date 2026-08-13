/**
 * Background read-cache warmer for farmer + agent keys.
 * Call sites: outboxConnectivitySync (NetInfo / AppState) and authStore (setAuth / loadStoredAuth).
 */
import { getAuthToken } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { isAgentRole, normalizeRole } from '../../shared/src/roles';
import { putReadCache, READ_CACHE_KEYS } from './offlineReadCache';
import {
  fetchAgentDashboardForCache,
  fetchAgentFarmersForCache,
  fetchAgentTasksForCache,
  fetchFarmerDashboardForCache,
  fetchFarmerPaymentsForCache,
  fetchFarmerProjectTasksForCache,
  fetchFarmerProjectsForCache,
  fetchMessageThreadsForCache,
} from './readCacheFetchers';

/** Min gap between full warms for the same userScope (mid of planned 5–10 min). */
export const READ_CACHE_WARM_THROTTLE_MS = 7 * 60 * 1000;

/** Cap per-project task warms so large enrollments do not flood the API. */
const MAX_FARMER_PROJECT_TASK_WARMS = 12;

/** Small parallel pool so we do not hammer Render on cold start. */
const WARM_CONCURRENCY = 3;

export type WarmReadCacheReason =
  | 'manual'
  | 'reconnect'
  | 'launch'
  | 'foreground'
  | 'auth';

export type WarmReadCacheOptions = {
  /**
   * Bypass the per-userScope throttle (e.g. offline→online reconnect).
   * In-flight mutex still applies.
   */
  force?: boolean;
  /** Optional label for callers / proofs; unused by logic today. */
  reason?: WarmReadCacheReason;
};

export type WarmReadCacheKeyResult = {
  cacheKey: string;
  ok: boolean;
  error?: string;
};

export type WarmReadCachesResult = {
  skipped: boolean;
  skipReason?: 'no_auth' | 'throttled' | 'unsupported_role';
  userScope: string | null;
  warmed: WarmReadCacheKeyResult[];
};

type WarmJob = {
  cacheKey: string;
  fetchLive: () => Promise<unknown>;
};

let warmInFlight: Promise<WarmReadCachesResult> | null = null;
const lastWarmAtByScope = new Map<string, number>();

function resolveUserScope(): { userScope: string; role: string } | null {
  if (!getAuthToken()) return null;
  const user = useAuthStore.getState().user;
  if (!user?.userId || !user.role) return null;
  const userScope = (user.farmerId || user.userId || 'anon').trim() || 'anon';
  return { userScope, role: user.role };
}

function stillSameUser(userScope: string): boolean {
  const current = resolveUserScope();
  return !!current && current.userScope === userScope && !!getAuthToken();
}

async function warmOneKey(job: WarmJob, userScope: string): Promise<WarmReadCacheKeyResult> {
  if (!stillSameUser(userScope)) {
    return { cacheKey: job.cacheKey, ok: false, error: 'auth_changed' };
  }
  try {
    const data = await job.fetchLive();
    if (!stillSameUser(userScope)) {
      return { cacheKey: job.cacheKey, ok: false, error: 'auth_changed' };
    }
    await putReadCache(job.cacheKey, data, userScope);
    return { cacheKey: job.cacheKey, ok: true };
  } catch (err) {
    return {
      cacheKey: job.cacheKey,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWithConcurrency(
  jobs: WarmJob[],
  userScope: string,
  concurrency: number
): Promise<WarmReadCacheKeyResult[]> {
  if (jobs.length === 0) return [];
  const results: WarmReadCacheKeyResult[] = new Array(jobs.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      results[index] = await warmOneKey(jobs[index], userScope);
    }
  });

  await Promise.allSettled(workers);
  return results;
}

/**
 * Warm farmer:projects first (needed to discover task keys), then return
 * remaining jobs (dashboard / payments / messages / per-project tasks).
 */
async function prepareFarmerWarm(
  userScope: string
): Promise<{ early: WarmReadCacheKeyResult[]; jobs: WarmJob[] }> {
  let projectPayload: { projects?: Array<{ id?: string }> } | null = null;
  let projectResult: WarmReadCacheKeyResult;

  if (!stillSameUser(userScope)) {
    return {
      early: [{ cacheKey: READ_CACHE_KEYS.farmerProjects, ok: false, error: 'auth_changed' }],
      jobs: [],
    };
  }

  try {
    projectPayload = await fetchFarmerProjectsForCache();
    if (!stillSameUser(userScope)) {
      return {
        early: [{ cacheKey: READ_CACHE_KEYS.farmerProjects, ok: false, error: 'auth_changed' }],
        jobs: [],
      };
    }
    await putReadCache(READ_CACHE_KEYS.farmerProjects, projectPayload, userScope);
    projectResult = { cacheKey: READ_CACHE_KEYS.farmerProjects, ok: true };
  } catch (err) {
    projectResult = {
      cacheKey: READ_CACHE_KEYS.farmerProjects,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const jobs: WarmJob[] = [
    {
      cacheKey: READ_CACHE_KEYS.farmerDashboard,
      fetchLive: fetchFarmerDashboardForCache,
    },
    {
      cacheKey: READ_CACHE_KEYS.farmerPayments,
      fetchLive: fetchFarmerPaymentsForCache,
    },
    {
      cacheKey: READ_CACHE_KEYS.messageThreads,
      fetchLive: fetchMessageThreadsForCache,
    },
  ];

  if (projectResult.ok && projectPayload) {
    const projectIds = (projectPayload.projects ?? [])
      .map((p) => (p?.id != null ? String(p.id) : ''))
      .filter(Boolean)
      .slice(0, MAX_FARMER_PROJECT_TASK_WARMS);
    for (const id of projectIds) {
      jobs.push({
        cacheKey: READ_CACHE_KEYS.farmerTasks(id),
        fetchLive: () => fetchFarmerProjectTasksForCache(id),
      });
    }
  }

  return { early: [projectResult], jobs };
}

function buildAgentJobs(): WarmJob[] {
  return [
    {
      cacheKey: READ_CACHE_KEYS.agentDashboard,
      fetchLive: fetchAgentDashboardForCache,
    },
    {
      cacheKey: READ_CACHE_KEYS.agentTasks,
      fetchLive: fetchAgentTasksForCache,
    },
    {
      cacheKey: READ_CACHE_KEYS.agentFarmers,
      fetchLive: fetchAgentFarmersForCache,
    },
    {
      cacheKey: READ_CACHE_KEYS.messageThreads,
      fetchLive: fetchMessageThreadsForCache,
    },
  ];
}

async function warmOnce(userScope: string, role: string): Promise<WarmReadCachesResult> {
  const normalized = normalizeRole(role);

  if (normalized === 'farmer') {
    const { early, jobs } = await prepareFarmerWarm(userScope);
    const rest = await runWithConcurrency(jobs, userScope, WARM_CONCURRENCY);
    lastWarmAtByScope.set(userScope, Date.now());
    return { skipped: false, userScope, warmed: [...early, ...rest] };
  }

  if (isAgentRole(normalized)) {
    const warmed = await runWithConcurrency(buildAgentJobs(), userScope, WARM_CONCURRENCY);
    lastWarmAtByScope.set(userScope, Date.now());
    return { skipped: false, userScope, warmed };
  }

  return {
    skipped: true,
    skipReason: 'unsupported_role',
    userScope,
    warmed: [],
  };
}

/**
 * Fetch + putReadCache for all role-relevant READ_CACHE_KEYS for the signed-in user.
 * Safe to call often: throttled per userScope, single in-flight run, per-key failures isolated.
 */
export async function warmReadCachesForCurrentUser(
  options: WarmReadCacheOptions = {}
): Promise<WarmReadCachesResult> {
  if (warmInFlight) return warmInFlight;

  const resolved = resolveUserScope();
  if (!resolved) {
    return { skipped: true, skipReason: 'no_auth', userScope: null, warmed: [] };
  }

  const { userScope, role } = resolved;
  const lastAt = lastWarmAtByScope.get(userScope) ?? 0;
  if (!options.force && Date.now() - lastAt < READ_CACHE_WARM_THROTTLE_MS) {
    return { skipped: true, skipReason: 'throttled', userScope, warmed: [] };
  }

  warmInFlight = (async () => warmOnce(userScope, role))();

  try {
    return await warmInFlight;
  } finally {
    warmInFlight = null;
  }
}

/** Test helper: clear throttle timestamps between proof runs. */
export function __resetReadCacheWarmupForTests(): void {
  lastWarmAtByScope.clear();
}
