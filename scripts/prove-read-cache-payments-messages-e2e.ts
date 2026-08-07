/**
 * Proof: payments + messages read-cache keys.
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-read-cache-payments-messages.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-read-cache-payments-messages.bundle.cjs
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
  console.log('Offline read cache — payments + messages proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const {
    setAuthToken,
    devTokenLogin,
    getFarmerPayments,
    getMessageThreads,
  } = await import('../mobile/src/api/client');
  const {
    loadWithReadCache,
    READ_CACHE_KEYS,
    offlineCacheBannerText,
    clearReadCacheForUser,
  } = await import('../mobile/src/services/offlineReadCache');

  const farmerAuth = await devTokenLogin('farmer', '+254712345678');
  if (!farmerAuth?.token) fail(`farmer dev-token failed: ${JSON.stringify(farmerAuth)}`);
  setAuthToken(farmerAuth.token);
  const farmerScope =
    farmerAuth.user?.farmerId || farmerAuth.user?.userId || 'farmer-proof';
  await clearReadCacheForUser(farmerScope);
  console.log(`\nFarmer scope=${farmerScope} (${farmerAuth.user?.name})`);

  // --- Payments ---
  const paymentsLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerPayments,
    userScope: farmerScope,
    fetchLive: () => getFarmerPayments(),
  });
  logStep(1, 'Populate farmer:payments from live API', {
    ok: !paymentsLive.fromCache && !!paymentsLive.data,
    detail: JSON.stringify(
      {
        fromCache: paymentsLive.fromCache,
        paymentCount: paymentsLive.data?.payments?.length ?? 0,
        summary: paymentsLive.data?.summary,
        fetchedAt: paymentsLive.fetchedAt,
      },
      null,
      2
    ),
  });
  if (paymentsLive.fromCache) fail('Expected live payments write');

  const paymentsOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.farmerPayments,
    userScope: farmerScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const paymentsBanner = offlineCacheBannerText(paymentsOffline.fetchedAt!);
  logStep(2, 'Offline payments fallback + banner', {
    ok:
      paymentsOffline.fromCache === true &&
      paymentsBanner.startsWith('Showing offline data from ') &&
      (paymentsOffline.data?.payments?.length ?? 0) ===
        (paymentsLive.data?.payments?.length ?? 0),
    detail: JSON.stringify(
      {
        fromCache: paymentsOffline.fromCache,
        banner: paymentsBanner,
        paymentCount: paymentsOffline.data?.payments?.length,
        summaryTotal: paymentsOffline.data?.summary?.total,
      },
      null,
      2
    ),
  });
  if (!paymentsOffline.fromCache) fail('Payments did not fall back to cache');

  // --- Messages ---
  const messagesLive = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.messageThreads,
    userScope: farmerScope,
    fetchLive: async () => {
      const data = await getMessageThreads();
      return { threads: data.threads ?? [] };
    },
  });
  logStep(3, 'Populate messages:threads from live API', {
    ok: !messagesLive.fromCache,
    detail: JSON.stringify(
      {
        fromCache: messagesLive.fromCache,
        threadCount: messagesLive.data?.threads?.length ?? 0,
        sample: (messagesLive.data?.threads ?? [])
          .slice(0, 3)
          .map((t: { other_user_name?: string }) => t.other_user_name),
        fetchedAt: messagesLive.fetchedAt,
      },
      null,
      2
    ),
  });
  if (messagesLive.fromCache) fail('Expected live messages write');

  const messagesOffline = await loadWithReadCache({
    cacheKey: READ_CACHE_KEYS.messageThreads,
    userScope: farmerScope,
    fetchLive: async () => {
      throw new Error('Network Error (simulated offline)');
    },
  });
  const messagesBanner = offlineCacheBannerText(messagesOffline.fetchedAt!);
  logStep(4, 'Offline messages fallback + banner', {
    ok:
      messagesOffline.fromCache === true &&
      messagesBanner.startsWith('Showing offline data from ') &&
      (messagesOffline.data?.threads?.length ?? 0) ===
        (messagesLive.data?.threads?.length ?? 0),
    detail: JSON.stringify(
      {
        fromCache: messagesOffline.fromCache,
        banner: messagesBanner,
        threadCount: messagesOffline.data?.threads?.length,
      },
      null,
      2
    ),
  });
  if (!messagesOffline.fromCache) fail('Messages did not fall back to cache');

  console.log('\n========================================');
  console.log('PROOF PASSED — payments + messages read cache');
  console.log(`Payments banner: ${paymentsBanner}`);
  console.log(`Messages banner: ${messagesBanner}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nPROOF CRASHED:', err);
  process.exit(1);
});
