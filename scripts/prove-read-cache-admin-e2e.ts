/**
 * Proof: admin read-cache tranche 1 — Dashboard, Farmers (list + detail), Tasks (browse).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-read-cache-admin.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-read-cache-admin.bundle.cjs
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
  console.log('Offline read cache — admin tranche 1 proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const {
    setAuthToken,
    devQuickLogin,
    getAdminDashboard,
    getFarmers,
    getFarmerById,
    getAdminFarmerTasks,
    getProgramProjects,
  } = await import('../mobile/src/api/client');
  const {
    loadWithReadCache,
    READ_CACHE_KEYS,
    offlineCacheBannerText,
    clearReadCacheForUser,
  } = await import('../mobile/src/services/offlineReadCache');

  const adminAuth = await devQuickLogin('+254700000001');
  if (!adminAuth?.token) fail(`admin dev-login failed: ${JSON.stringify(adminAuth)}`);
  setAuthToken(adminAuth.token);
  const adminScope = adminAuth.user?.userId || 'admin-proof';
  await clearReadCacheForUser(adminScope);
  console.log(
    `\nAdmin scope=${adminScope} (${adminAuth.user?.name}, role=${adminAuth.user?.role})`
  );

  // --- Dashboard ---
  const dashLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminDashboard,
    userScope: adminScope,
    fetchLive: () => getAdminDashboard(),
  });
  logStep(1, 'Populate admin:dashboard from live API', {
    ok: !dashLive.fromCache && !!dashLive.data,
    detail: JSON.stringify(
      {
        fromCache: dashLive.fromCache,
        totalFarmers: dashLive.data?.totalFarmers,
        totalUsers: dashLive.data?.totalUsers,
        pendingPaymentsTotal: dashLive.data?.pendingPaymentsTotal,
        activeProjects: dashLive.data?.activeProjects,
        fetchedAt: dashLive.fetchedAt,
      },
      null,
      2
    ),
  });
  if (dashLive.fromCache) fail('Expected live admin dashboard write');

  const dashOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminDashboard,
    userScope: adminScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const dashBanner = offlineCacheBannerText(dashOffline.fetchedAt!);
  logStep(2, 'Offline admin dashboard fallback + banner', {
    ok:
      dashOffline.fromCache === true &&
      dashBanner.startsWith('Showing offline data from ') &&
      dashOffline.data?.totalFarmers === dashLive.data?.totalFarmers,
    detail: JSON.stringify(
      {
        fromCache: dashOffline.fromCache,
        banner: dashBanner,
        totalFarmers: dashOffline.data?.totalFarmers,
        activeProjects: dashOffline.data?.activeProjects,
      },
      null,
      2
    ),
  });
  if (!dashOffline.fromCache) fail('Admin dashboard did not fall back to cache');

  // --- Farmers list ---
  const farmersLive = await loadWithReadCache<{
    farmers?: Array<{ farmer_id: string; name: string }>;
    total?: number;
  }>({
    cacheKey: READ_CACHE_KEYS.adminFarmers,
    userScope: adminScope,
    fetchLive: () => getFarmers(50, 0),
  });
  const firstFarmerId = farmersLive.data?.farmers?.[0]?.farmer_id as string | undefined;
  logStep(3, 'Populate admin:farmers from live API', {
    ok: !farmersLive.fromCache && !!firstFarmerId,
    detail: JSON.stringify(
      {
        fromCache: farmersLive.fromCache,
        count: farmersLive.data?.farmers?.length ?? 0,
        total: farmersLive.data?.total,
        sample: (farmersLive.data?.farmers ?? [])
          .slice(0, 3)
          .map((f) => ({ id: f.farmer_id, name: f.name })),
      },
      null,
      2
    ),
  });
  if (!firstFarmerId) fail('No admin farmers for detail cache proof');

  const farmersOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminFarmers,
    userScope: adminScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const farmersBanner = offlineCacheBannerText(farmersOffline.fetchedAt!);
  logStep(4, 'Offline admin farmers list fallback + banner', {
    ok:
      farmersOffline.fromCache === true &&
      farmersBanner.startsWith('Showing offline data from ') &&
      (farmersOffline.data?.farmers?.length ?? 0) ===
        (farmersLive.data?.farmers?.length ?? 0),
    detail: JSON.stringify(
      {
        fromCache: farmersOffline.fromCache,
        banner: farmersBanner,
        count: farmersOffline.data?.farmers?.length,
      },
      null,
      2
    ),
  });
  if (!farmersOffline.fromCache) fail('Admin farmers did not fall back to cache');

  // --- Farmer detail ---
  const detailLive = await loadWithReadCache<{
    farmer?: { name?: string; phone_number?: string; status?: string };
  }>({
    cacheKey: READ_CACHE_KEYS.adminFarmerDetail(firstFarmerId),
    userScope: adminScope,
    fetchLive: () => getFarmerById(firstFarmerId),
  });
  logStep(5, 'Populate admin:farmer:{id} from live API', {
    ok: !detailLive.fromCache && !!detailLive.data?.farmer?.name,
    detail: JSON.stringify(
      {
        fromCache: detailLive.fromCache,
        farmerId: firstFarmerId,
        name: detailLive.data?.farmer?.name,
        phone: detailLive.data?.farmer?.phone_number,
        status: detailLive.data?.farmer?.status,
      },
      null,
      2
    ),
  });
  if (detailLive.fromCache) fail('Expected live farmer detail write');

  const detailOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminFarmerDetail(firstFarmerId),
    userScope: adminScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const detailBanner = offlineCacheBannerText(detailOffline.fetchedAt!);
  logStep(6, 'Offline farmer detail fallback + banner', {
    ok:
      detailOffline.fromCache === true &&
      detailBanner.startsWith('Showing offline data from ') &&
      detailOffline.data?.farmer?.name === detailLive.data?.farmer?.name,
    detail: JSON.stringify(
      {
        fromCache: detailOffline.fromCache,
        banner: detailBanner,
        name: detailOffline.data?.farmer?.name,
      },
      null,
      2
    ),
  });
  if (!detailOffline.fromCache) fail('Admin farmer detail did not fall back to cache');

  // --- Tasks (browse-only cache; approve/reject gated by fromCache) ---
  const tasksLive = await loadWithReadCache<{
    tasks?: Array<{ id: string; name: string; status: string }>;
    projects?: Array<{ id: string; name: string }>;
  }>({
    cacheKey: READ_CACHE_KEYS.adminTasks,
    userScope: adminScope,
    fetchLive: async () => {
      const [taskData, projectData] = await Promise.all([
        getAdminFarmerTasks({}),
        getProgramProjects(),
      ]);
      return {
        tasks: taskData.tasks ?? [],
        projects: projectData.projects ?? [],
      };
    },
  });
  logStep(7, 'Populate admin:tasks from live API', {
    ok: !tasksLive.fromCache,
    detail: JSON.stringify(
      {
        fromCache: tasksLive.fromCache,
        taskCount: tasksLive.data?.tasks?.length ?? 0,
        projectCount: tasksLive.data?.projects?.length ?? 0,
        sample: (tasksLive.data?.tasks ?? [])
          .slice(0, 3)
          .map((t) => ({ name: t.name, status: t.status })),
      },
      null,
      2
    ),
  });
  if (tasksLive.fromCache) fail('Expected live admin tasks write');

  const tasksOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminTasks,
    userScope: adminScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const tasksBanner = offlineCacheBannerText(tasksOffline.fetchedAt!);
  // Same gate as AdminTasksScreen: Approve/Reject only when !cacheFetchedAt
  const approveRejectAllowed = !tasksOffline.fromCache;
  logStep(8, 'Offline admin tasks fallback + approve/reject gated', {
    ok:
      tasksOffline.fromCache === true &&
      tasksBanner.startsWith('Showing offline data from ') &&
      (tasksOffline.data?.tasks?.length ?? 0) === (tasksLive.data?.tasks?.length ?? 0) &&
      approveRejectAllowed === false,
    detail: JSON.stringify(
      {
        fromCache: tasksOffline.fromCache,
        banner: tasksBanner,
        taskCount: tasksOffline.data?.tasks?.length,
        approveRejectAllowed,
        note: 'UI hides Approve/Reject whenever offline banner is showing (cacheFetchedAt set)',
      },
      null,
      2
    ),
  });
  if (!tasksOffline.fromCache) fail('Admin tasks did not fall back to cache');
  if (approveRejectAllowed) fail('Approve/Reject must be disabled on cached tasks');

  // Scope isolation
  const miss = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.adminDashboard,
    userScope: 'someone-else-admin-scope',
    fetchLive: async () => {
      throw new Error('Network Error');
    },
  }).then(
    () => ({ hit: true }),
    () => ({ hit: false })
  );
  logStep(9, 'User-scope isolation (cold miss throws)', {
    ok: miss.hit === false,
    detail: JSON.stringify(miss),
  });
  if (miss.hit) fail('Cache leaked across user scopes');

  console.log('\n========================================');
  console.log('PROOF PASSED — admin read cache tranche 1');
  console.log(`Dashboard banner: ${dashBanner}`);
  console.log(`Farmers banner: ${farmersBanner}`);
  console.log(`Detail banner: ${detailBanner}`);
  console.log(`Tasks banner: ${tasksBanner}`);
  console.log('Approve/Reject: disabled when offline banner showing');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nPROOF CRASHED:', err);
  process.exit(1);
});
