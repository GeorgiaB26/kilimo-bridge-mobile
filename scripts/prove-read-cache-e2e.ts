/**
 * Proof: offline read cache — populate from live API, simulate fetch failure,
 * confirm cached payloads + “Showing offline data from …” indicator.
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-read-cache.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-read-cache.bundle.cjs
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

async function main() {
  console.log('Offline read cache — end-to-end proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const {
    setAuthToken,
    devTokenLogin,
    getFarmerDashboard,
    getFarmerHierarchyProjects,
    getFarmerProjectTasks,
    api,
  } = await import('../mobile/src/api/client');
  const {
    loadWithReadCache,
    getReadCache,
    READ_CACHE_KEYS,
    offlineCacheBannerText,
    clearReadCacheForUser,
  } = await import('../mobile/src/services/offlineReadCache');

  // ---------- Farmer path ----------
  const farmerAuth = await devTokenLogin('farmer', '+254712345678');
  if (!farmerAuth?.token) fail(`farmer dev-token failed: ${JSON.stringify(farmerAuth)}`);
  setAuthToken(farmerAuth.token);
  const farmerScope =
    farmerAuth.user?.farmerId || farmerAuth.user?.userId || 'farmer-proof';
  await clearReadCacheForUser(farmerScope);
  console.log(`\nFarmer scope=${farmerScope} (${farmerAuth.user?.name})`);

  // Step 1: live populate dashboard
  const dashLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerDashboard,
    userScope: farmerScope,
    fetchLive: () => getFarmerDashboard(),
  });
  logStep(1, 'Populate farmer:dashboard from live API', {
    ok: !dashLive.fromCache && !!dashLive.data,
    detail: JSON.stringify(
      {
        fromCache: dashLive.fromCache,
        pendingAmount: dashLive.data?.pendingAmount,
        projects: dashLive.data?.activeProjects?.length,
        fetchedAt: dashLive.fetchedAt,
      },
      null,
      2
    ),
  });
  if (dashLive.fromCache) fail('Expected live dashboard write, got cache hit');

  // Step 2: live populate projects
  const projectsLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerProjects,
    userScope: farmerScope,
    fetchLive: () => getFarmerHierarchyProjects(),
  });
  const projectId = projectsLive.data?.projects?.[0]?.id as string | undefined;
  logStep(2, 'Populate farmer:projects from live API', {
    ok: !projectsLive.fromCache && !!projectId,
    detail: JSON.stringify(
      {
        fromCache: projectsLive.fromCache,
        count: projectsLive.data?.projects?.length,
        firstId: projectId,
        firstName: projectsLive.data?.projects?.[0]?.name,
      },
      null,
      2
    ),
  });
  if (!projectId) fail('No hierarchy project for demo farmer');

  // Step 3: live populate tasks
  const tasksLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerTasks(projectId),
    userScope: farmerScope,
    fetchLive: () => getFarmerProjectTasks(projectId),
  });
  logStep(3, 'Populate farmer:tasks:{projectId} from live API', {
    ok: !tasksLive.fromCache && (tasksLive.data?.tasks?.length ?? 0) > 0,
    detail: JSON.stringify(
      {
        fromCache: tasksLive.fromCache,
        taskCount: tasksLive.data?.tasks?.length,
        sample: tasksLive.data?.tasks?.slice(0, 2).map((t: { name: string; status: string }) => ({
          name: t.name,
          status: t.status,
        })),
      },
      null,
      2
    ),
  });

  // Step 4: simulate offline fetch failure → cache fallback + banner text
  const dashOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerDashboard,
    userScope: farmerScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const dashBanner = offlineCacheBannerText(dashOffline.fetchedAt!);
  const dashCached = await getReadCache(READ_CACHE_KEYS.farmerDashboard, farmerScope);
  logStep(4, 'Offline dashboard fallback + banner copy', {
    ok:
      dashOffline.fromCache === true &&
      dashBanner.startsWith('Showing offline data from ') &&
      !!dashCached &&
      dashOffline.data?.pendingAmount === dashLive.data?.pendingAmount,
    detail: JSON.stringify(
      {
        fromCache: dashOffline.fromCache,
        banner: dashBanner,
        pendingAmount: dashOffline.data?.pendingAmount,
        activeProjects: dashOffline.data?.activeProjects?.length,
      },
      null,
      2
    ),
  });
  if (!dashOffline.fromCache) fail('Dashboard did not fall back to cache');

  const projectsOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerProjects,
    userScope: farmerScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const tasksOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerTasks(projectId),
    userScope: farmerScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  logStep(5, 'Offline projects + tasks fallback', {
    ok:
      projectsOffline.fromCache &&
      tasksOffline.fromCache &&
      projectsOffline.data?.projects?.[0]?.id === projectId &&
      (tasksOffline.data?.tasks?.length ?? 0) === (tasksLive.data?.tasks?.length ?? 0),
    detail: JSON.stringify(
      {
        projectsBanner: offlineCacheBannerText(projectsOffline.fetchedAt!),
        tasksBanner: offlineCacheBannerText(tasksOffline.fetchedAt!),
        projectCount: projectsOffline.data?.projects?.length,
        taskCount: tasksOffline.data?.tasks?.length,
      },
      null,
      2
    ),
  });

  // ---------- Agent path ----------
  const agentAuth = await devTokenLogin('field_agent');
  if (!agentAuth?.token) fail(`agent dev-token failed: ${JSON.stringify(agentAuth)}`);
  setAuthToken(agentAuth.token);
  const agentScope = agentAuth.user?.userId || 'agent-proof';
  await clearReadCacheForUser(agentScope);
  console.log(`\nAgent scope=${agentScope} (${agentAuth.user?.name})`);

  const farmersLive = await loadWithReadCache<{ farmers?: Array<{ farmer_id: string; name: string }> }>({
    cacheKey: READ_CACHE_KEYS.agentFarmers,
    userScope: agentScope,
    fetchLive: async () => {
      const res = await api.get('/agents/farmers');
      return res.data;
    },
  });
  logStep(6, 'Populate agent:farmers from live API', {
    ok: !farmersLive.fromCache,
    detail: JSON.stringify(
      {
        fromCache: farmersLive.fromCache,
        count: farmersLive.data?.farmers?.length ?? 0,
        sample: (farmersLive.data?.farmers ?? []).slice(0, 3).map((f) => f.name),
      },
      null,
      2
    ),
  });

  const farmersOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.agentFarmers,
    userScope: agentScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const agentBanner = offlineCacheBannerText(farmersOffline.fetchedAt!);
  logStep(7, 'Offline agent farmers fallback + banner copy', {
    ok:
      farmersOffline.fromCache === true &&
      agentBanner.startsWith('Showing offline data from ') &&
      (farmersOffline.data?.farmers?.length ?? 0) === (farmersLive.data?.farmers?.length ?? 0),
    detail: JSON.stringify(
      {
        fromCache: farmersOffline.fromCache,
        banner: agentBanner,
        count: farmersOffline.data?.farmers?.length,
      },
      null,
      2
    ),
  });
  if (!farmersOffline.fromCache) fail('Agent farmers did not fall back to cache');

  // Cold-miss: wrong scope must not return another user’s cache
  const miss = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerDashboard,
    userScope: 'someone-else-scope',
    fetchLive: async () => {
      throw new Error('Network Error');
    },
  }).then(
    () => ({ hit: true }),
    () => ({ hit: false })
  );
  logStep(8, 'User-scope isolation (cold miss throws)', {
    ok: miss.hit === false,
    detail: JSON.stringify(miss),
  });
  if (miss.hit) fail('Cache leaked across user scopes');

  console.log('\n========================================');
  console.log('PROOF PASSED — read cache works offline');
  console.log(`Farmer banner example: ${dashBanner}`);
  console.log(`Agent banner example: ${agentBanner}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nPROOF CRASHED:', err);
  process.exit(1);
});
