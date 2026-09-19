/**
 * Proof: proactive read-cache warm — login online → warmReadCachesForCurrentUser
 * populates role keys → simulated offline → loadWithReadCache returns fromCache
 * without ever having visited screens / populated via successful fetchLive first.
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-read-cache-warmup.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-read-cache-warmup.bundle.cjs
 */
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });
process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

type StepResult = { ok: boolean; detail: string };

function logStep(n: number | string, title: string, result: StepResult) {
  console.log(`\n=== Step ${n}: ${title} [${result.ok ? 'PASS' : 'FAIL'}] ===`);
  console.log(result.detail);
}

function fail(msg: string): never {
  console.error(`\nPROOF FAILED: ${msg}`);
  process.exit(1);
}

function offlineFetchLive(label: string, calls: Record<string, number>) {
  return async () => {
    calls[label] = (calls[label] ?? 0) + 1;
    throw new Error(`Network Error (simulated offline) — ${label}`);
  };
}

async function main() {
  console.log('Proactive read-cache warm — end-to-end proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const { setAuthToken, devTokenLogin } = await import('../mobile/src/api/client');
  const { useAuthStore } = await import('../mobile/src/store/authStore');
  const {
    loadWithReadCache,
    getReadCache,
    READ_CACHE_KEYS,
    offlineCacheBannerText,
    clearReadCacheForUser,
  } = await import('../mobile/src/services/offlineReadCache');
  const {
    warmReadCachesForCurrentUser,
    __resetReadCacheWarmupForTests,
  } = await import('../mobile/src/services/readCacheWarmup');
  const { fetchFarmerProjectsForCache } = await import(
    '../mobile/src/services/readCacheFetchers'
  );

  // -------------------------------------------------------------------------
  // Farmer: login → warm → offline loadWithReadCache (no prior screen warm)
  // -------------------------------------------------------------------------
  __resetReadCacheWarmupForTests();
  const farmerAuth = await devTokenLogin('farmer', '+254712345678');
  if (!farmerAuth?.token || !farmerAuth.user) {
    fail(`farmer dev-token failed: ${JSON.stringify(farmerAuth)}`);
  }
  setAuthToken(farmerAuth.token);
  useAuthStore.setState({
    token: farmerAuth.token,
    user: farmerAuth.user,
    isAuthenticated: true,
    isLoading: false,
  });
  const farmerScope =
    farmerAuth.user.farmerId || farmerAuth.user.userId || 'farmer-proof';
  await clearReadCacheForUser(farmerScope);
  console.log(`\nFarmer scope=${farmerScope} (${farmerAuth.user.name})`);

  logStep(1, 'Simulate farmer login online (token + auth store)', {
    ok: !!useAuthStore.getState().user?.userId && !!farmerAuth.token,
    detail: JSON.stringify({
      role: farmerAuth.user.role,
      userId: farmerAuth.user.userId,
      farmerId: farmerAuth.user.farmerId,
      scope: farmerScope,
    }),
  });

  // Sanity: cache empty before warm (no screen visit).
  const preProjects = await getReadCache(READ_CACHE_KEYS.farmerProjects, farmerScope);
  const preDash = await getReadCache(READ_CACHE_KEYS.farmerDashboard, farmerScope);
  logStep(2, 'Cache empty before warm (no screen fetchLive)', {
    ok: preProjects == null && preDash == null,
    detail: JSON.stringify({
      farmerProjects: preProjects,
      farmerDashboard: preDash,
    }),
  });
  if (preProjects || preDash) fail('Expected empty farmer cache before warm');

  const farmerWarm = await warmReadCachesForCurrentUser({
    force: true,
    reason: 'manual',
  });
  const farmerOkKeys = (farmerWarm.warmed ?? [])
    .filter((r) => r.ok)
    .map((r) => r.cacheKey);
  const farmerFailed = (farmerWarm.warmed ?? []).filter((r) => !r.ok);

  const cachedProjects = await getReadCache<{ projects?: Array<{ id: string; name?: string }> }>(
    READ_CACHE_KEYS.farmerProjects,
    farmerScope
  );
  const cachedDash = await getReadCache(READ_CACHE_KEYS.farmerDashboard, farmerScope);
  const projectIds = (cachedProjects?.payload?.projects ?? [])
    .map((p) => p.id)
    .filter(Boolean);
  const firstProjectId = projectIds[0];
  const cachedTasks = firstProjectId
    ? await getReadCache(READ_CACHE_KEYS.farmerTasks(firstProjectId), farmerScope)
    : null;

  logStep(3, 'warmReadCachesForCurrentUser populates farmer keys', {
    ok:
      farmerWarm.skipped === false &&
      farmerOkKeys.includes(READ_CACHE_KEYS.farmerProjects) &&
      farmerOkKeys.includes(READ_CACHE_KEYS.farmerDashboard) &&
      !!firstProjectId &&
      !!cachedProjects &&
      !!cachedDash &&
      !!cachedTasks &&
      farmerOkKeys.includes(READ_CACHE_KEYS.farmerTasks(firstProjectId)),
    detail: JSON.stringify(
      {
        skipped: farmerWarm.skipped,
        skipReason: farmerWarm.skipReason,
        okKeys: farmerOkKeys,
        failed: farmerFailed,
        projectCount: projectIds.length,
        firstProjectId,
        firstProjectName: cachedProjects?.payload?.projects?.[0]?.name,
        taskCount: (cachedTasks?.payload as { tasks?: unknown[] } | undefined)?.tasks?.length,
        dashFetchedAt: cachedDash?.fetchedAt,
      },
      null,
      2
    ),
  });
  if (!cachedProjects || !cachedDash || !firstProjectId || !cachedTasks) {
    fail('Farmer warm did not populate projects/dashboard/tasks');
  }

  // Simulate offline: loadWithReadCache must hit cache. fetchLive throws — never used
  // successfully to populate (warmer already did). Track call counts for clarity.
  const farmerOfflineCalls: Record<string, number> = {};
  const projectsOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerProjects,
    userScope: farmerScope,
    fetchLive: offlineFetchLive('farmer:projects', farmerOfflineCalls),
  });
  const dashOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerDashboard,
    userScope: farmerScope,
    fetchLive: offlineFetchLive('farmer:dashboard', farmerOfflineCalls),
  });
  const tasksOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerTasks(firstProjectId),
    userScope: farmerScope,
    fetchLive: offlineFetchLive(`farmer:tasks:${firstProjectId}`, farmerOfflineCalls),
  });

  const projectsBanner = offlineCacheBannerText(projectsOffline.fetchedAt!);
  logStep(4, 'Offline farmer loadWithReadCache → fromCache (no prior screen warm)', {
    ok:
      projectsOffline.fromCache === true &&
      dashOffline.fromCache === true &&
      tasksOffline.fromCache === true &&
      (projectsOffline.data?.projects?.length ?? 0) === projectIds.length &&
      projectsBanner.startsWith('Showing offline data from ') &&
      // fetchLive attempted once each (fails) — data still from warmer, not live screen populate
      farmerOfflineCalls['farmer:projects'] === 1 &&
      farmerOfflineCalls['farmer:dashboard'] === 1,
    detail: JSON.stringify(
      {
        projects: {
          fromCache: projectsOffline.fromCache,
          count: projectsOffline.data?.projects?.length,
          banner: projectsBanner,
        },
        dashboard: {
          fromCache: dashOffline.fromCache,
          fetchedAt: dashOffline.fetchedAt,
        },
        tasks: {
          fromCache: tasksOffline.fromCache,
          count: (tasksOffline.data as { tasks?: unknown[] })?.tasks?.length,
        },
        offlineFetchLiveCalls: farmerOfflineCalls,
        note: 'fetchLive is invoked by loadWithReadCache then fails; payload comes from warmer putReadCache',
      },
      null,
      2
    ),
  });
  if (!projectsOffline.fromCache || !dashOffline.fromCache || !tasksOffline.fromCache) {
    fail('Farmer offline loadWithReadCache did not return fromCache');
  }

  // Confirm shared fetchers still match warmer shape (online sanity — does not write via screens).
  const liveProjects = await fetchFarmerProjectsForCache();
  logStep(4.5, 'Warmed farmer:projects matches live shape (optional sanity)', {
    ok: (liveProjects?.projects?.length ?? 0) === projectIds.length,
    detail: JSON.stringify({
      warmedCount: projectIds.length,
      liveCount: liveProjects?.projects?.length ?? 0,
    }),
  });

  // -------------------------------------------------------------------------
  // Agent: login → warm → offline loadWithReadCache
  // -------------------------------------------------------------------------
  __resetReadCacheWarmupForTests();
  const agentAuth = await devTokenLogin('field_agent');
  if (!agentAuth?.token || !agentAuth.user) {
    fail(`agent dev-token failed: ${JSON.stringify(agentAuth)}`);
  }
  setAuthToken(agentAuth.token);
  useAuthStore.setState({
    token: agentAuth.token,
    user: agentAuth.user,
    isAuthenticated: true,
    isLoading: false,
  });
  const agentScope = agentAuth.user.userId || 'agent-proof';
  await clearReadCacheForUser(agentScope);
  console.log(`\nAgent scope=${agentScope} (${agentAuth.user.name})`);

  logStep(5, 'Simulate agent login online (token + auth store)', {
    ok: !!useAuthStore.getState().user?.userId && !!agentAuth.token,
    detail: JSON.stringify({
      role: agentAuth.user.role,
      userId: agentAuth.user.userId,
      scope: agentScope,
    }),
  });

  const preAgentDash = await getReadCache(READ_CACHE_KEYS.agentDashboard, agentScope);
  const preAgentTasks = await getReadCache(READ_CACHE_KEYS.agentTasks, agentScope);
  const preAgentFarmers = await getReadCache(READ_CACHE_KEYS.agentFarmers, agentScope);
  logStep(6, 'Cache empty before agent warm (no screen fetchLive)', {
    ok: preAgentDash == null && preAgentTasks == null && preAgentFarmers == null,
    detail: JSON.stringify({
      agentDashboard: preAgentDash,
      agentTasks: preAgentTasks,
      agentFarmers: preAgentFarmers,
    }),
  });
  if (preAgentDash || preAgentTasks || preAgentFarmers) {
    fail('Expected empty agent cache before warm');
  }

  const agentWarm = await warmReadCachesForCurrentUser({
    force: true,
    reason: 'manual',
  });
  const agentOkKeys = (agentWarm.warmed ?? [])
    .filter((r) => r.ok)
    .map((r) => r.cacheKey);
  const agentFailed = (agentWarm.warmed ?? []).filter((r) => !r.ok);

  const agentDashCached = await getReadCache(READ_CACHE_KEYS.agentDashboard, agentScope);
  const agentTasksCached = await getReadCache<{
    farmer_tasks?: unknown[];
    personal_tasks?: unknown[];
  }>(READ_CACHE_KEYS.agentTasks, agentScope);
  const agentFarmersCached = await getReadCache<{ farmers?: Array<{ name?: string }> }>(
    READ_CACHE_KEYS.agentFarmers,
    agentScope
  );

  logStep(7, 'warmReadCachesForCurrentUser populates agent keys', {
    ok:
      agentWarm.skipped === false &&
      agentOkKeys.includes(READ_CACHE_KEYS.agentDashboard) &&
      agentOkKeys.includes(READ_CACHE_KEYS.agentTasks) &&
      agentOkKeys.includes(READ_CACHE_KEYS.agentFarmers) &&
      !!agentDashCached &&
      !!agentTasksCached &&
      !!agentFarmersCached,
    detail: JSON.stringify(
      {
        skipped: agentWarm.skipped,
        skipReason: agentWarm.skipReason,
        okKeys: agentOkKeys,
        failed: agentFailed,
        farmerTaskCount: agentTasksCached?.payload?.farmer_tasks?.length ?? 0,
        personalTaskCount: agentTasksCached?.payload?.personal_tasks?.length ?? 0,
        farmerCount: agentFarmersCached?.payload?.farmers?.length ?? 0,
        sampleFarmers: (agentFarmersCached?.payload?.farmers ?? [])
          .slice(0, 3)
          .map((f) => f.name),
        dashFetchedAt: agentDashCached?.fetchedAt,
      },
      null,
      2
    ),
  });
  if (!agentDashCached || !agentTasksCached || !agentFarmersCached) {
    fail('Agent warm did not populate dashboard/tasks/farmers');
  }

  const agentOfflineCalls: Record<string, number> = {};
  const agentDashOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.agentDashboard,
    userScope: agentScope,
    fetchLive: offlineFetchLive('agent:dashboard', agentOfflineCalls),
  });
  const agentTasksOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.agentTasks,
    userScope: agentScope,
    fetchLive: offlineFetchLive('agent:tasks', agentOfflineCalls),
  });
  const agentFarmersOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.agentFarmers,
    userScope: agentScope,
    fetchLive: offlineFetchLive('agent:farmers', agentOfflineCalls),
  });
  const agentBanner = offlineCacheBannerText(agentDashOffline.fetchedAt!);

  logStep(8, 'Offline agent loadWithReadCache → fromCache (no prior screen warm)', {
    ok:
      agentDashOffline.fromCache === true &&
      agentTasksOffline.fromCache === true &&
      agentFarmersOffline.fromCache === true &&
      agentBanner.startsWith('Showing offline data from ') &&
      (agentFarmersOffline.data?.farmers?.length ?? 0) ===
        (agentFarmersCached.payload?.farmers?.length ?? 0),
    detail: JSON.stringify(
      {
        dashboard: { fromCache: agentDashOffline.fromCache, banner: agentBanner },
        tasks: {
          fromCache: agentTasksOffline.fromCache,
          farmer_tasks: agentTasksOffline.data?.farmer_tasks?.length,
          personal_tasks: agentTasksOffline.data?.personal_tasks?.length,
        },
        farmers: {
          fromCache: agentFarmersOffline.fromCache,
          count: agentFarmersOffline.data?.farmers?.length,
        },
        offlineFetchLiveCalls: agentOfflineCalls,
      },
      null,
      2
    ),
  });
  if (
    !agentDashOffline.fromCache ||
    !agentTasksOffline.fromCache ||
    !agentFarmersOffline.fromCache
  ) {
    fail('Agent offline loadWithReadCache did not return fromCache');
  }

  console.log('\n========================================');
  console.log('PROOF PASSED — warm populates cache without screen visits');
  console.log(`Farmer banner: ${projectsBanner}`);
  console.log(`Agent banner: ${agentBanner}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nPROOF CRASHED:', err);
  process.exit(1);
});
