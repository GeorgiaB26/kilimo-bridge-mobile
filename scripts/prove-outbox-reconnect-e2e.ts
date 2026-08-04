/**
 * Proof: offline→online NetInfo transition drains the sync outbox via
 * the same path App.tsx mounts (startOutboxConnectivitySync → processReadyOutbox).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-outbox-reconnect.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-outbox-reconnect.bundle.cjs
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });

process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

type StepResult = { ok: boolean; detail: string };

function logStep(n: number | string, title: string, result: StepResult) {
  const mark = result.ok ? 'PASS' : 'FAIL';
  console.log(`\n=== Step ${n}: ${title} [${mark}] ===`);
  console.log(result.detail);
}

function fail(msg: string): never {
  console.error(`\nPROOF FAILED: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log('Outbox reconnect sync — end-to-end proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const { setAuthToken, devTokenLogin, getFarmerHierarchyProjects, getFarmerProjectTasks } =
    await import('../mobile/src/api/client');
  const {
    enqueueOutbox,
    getOutboxItem,
    listOutbox,
    markOutboxFailed,
  } = await import('../mobile/src/services/offlineOutbox');
  const {
    startOutboxConnectivitySync,
    stopOutboxConnectivitySync,
    __setConnectivityOnlineForTests,
    __emitConnectivityRestoredForTests,
  } = await import('../mobile/src/services/outboxConnectivitySync');
  const { query, closeDatabase } = await import('../backend/src/db/database');

  const photoPath = path.join(__dirname, '_tmp_task_evidence.jpg');
  if (!fs.existsSync(photoPath)) {
    fail(`Missing ${photoPath} — generate a >=2KB JPEG first`);
  }
  const photoBase64 = fs.readFileSync(photoPath).toString('base64');

  // --- Auth ---
  const auth = await devTokenLogin('farmer', '+254712345678');
  if (!auth?.token) fail(`dev-token failed: ${JSON.stringify(auth)}`);
  setAuthToken(auth.token);
  console.log(`\nLogged in as ${auth.user?.name ?? 'farmer'}`);

  // --- Pick / reset a task ---
  const projects = await getFarmerHierarchyProjects();
  const projectId = projects.projects?.[0]?.id;
  if (!projectId) fail('No hierarchy projects — run seed:hierarchy');

  const tasksResp = await getFarmerProjectTasks(projectId);
  const tasks = (tasksResp.tasks ?? []) as Array<{ id: string; name: string; status: string }>;
  let target = tasks.find((t) =>
    ['not-started', 'in-progress', 'rejected'].includes(t.status)
  );
  if (!target) {
    const any = tasks.find((t) => t.status === 'submitted' || t.status === 'submitted-for-approval') ?? tasks[0];
    if (!any) fail('No farmer tasks');
    await query(
      `UPDATE farmer_tasks
       SET status = 'not-started', photo_evidence_url = NULL, notes = NULL,
           submitted_date = NULL, rejection_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [any.id]
    );
    target = { ...any, status: 'not-started' };
    console.log(`Reset task ${any.id} to not-started`);
  }

  const notes =
    'Reconnect proof: queued offline as failed-with-backoff, then NetInfo online transition drains via processReadyOutbox.';

  // ========== Step 1: Enqueue only (simulate offline save) ==========
  const item = await enqueueOutbox({
    actionType: 'task_submission',
    payload: {
      farmerTaskId: target.id,
      notes,
      taskName: target.name,
    },
    photoLocalUri: null,
    photoBase64,
  });

  // Simulate the connectivity failure that happens on immediate process while offline:
  // status=failed with nextAttemptAt 30s in the future — what would block naive processReadyOutbox.
  await markOutboxFailed(item.id, 'Network Error (simulated offline)');

  const afterFail = await getOutboxItem(item.id);
  const backoffFuture =
    !!afterFail?.nextAttemptAt &&
    new Date(afterFail.nextAttemptAt).getTime() > Date.now() + 5_000;

  logStep(1, 'Enqueue + simulate failed offline attempt (backoff in future)', {
    ok: afterFail?.status === 'failed' && backoffFuture,
    detail: JSON.stringify(
      {
        id: afterFail?.id,
        status: afterFail?.status,
        attemptCount: afterFail?.attemptCount,
        nextAttemptAt: afterFail?.nextAttemptAt,
        lastError: afterFail?.lastError,
        backoffFuture,
      },
      null,
      2
    ),
  });
  if (afterFail?.status !== 'failed' || !backoffFuture) {
    fail('Expected failed item with future nextAttemptAt');
  }

  // ========== Step 2: Start root listener, seed as offline ==========
  stopOutboxConnectivitySync();
  startOutboxConnectivitySync();
  // Override NetInfo's immediate "online" seed: we are offline with queued work.
  __setConnectivityOnlineForTests(false);

  const pendingBefore = await listOutbox({ actionType: 'task_submission', includeSynced: false });
  logStep(2, 'Connectivity sync started; device marked offline; outbox still queued', {
    ok: pendingBefore.some((r) => r.id === item.id && r.status !== 'synced'),
    detail: JSON.stringify(
      pendingBefore.map((r) => ({
        id: r.id,
        status: r.status,
        nextAttemptAt: r.nextAttemptAt,
      })),
      null,
      2
    ),
  });

  // ========== Step 3: Emit offline→online (same as NetInfo) ==========
  const syncResult = await __emitConnectivityRestoredForTests();

  logStep(3, 'Offline→online transition ran syncOutboxAfterReconnect → processReadyOutbox', {
    ok: syncResult.synced >= 1 && syncResult.failed === 0,
    detail: JSON.stringify(
      {
        processed: syncResult.processed,
        synced: syncResult.synced,
        failed: syncResult.failed,
        results: syncResult.results.map((r) =>
          r.ok
            ? { ok: true, id: r.item?.id, status: r.item?.status }
            : { ok: false, error: r.error, connectivity: r.connectivity }
        ),
      },
      null,
      2
    ),
  });
  if (syncResult.synced < 1) {
    fail(`Expected at least one synced item, got synced=${syncResult.synced}`);
  }

  const afterOutbox = await getOutboxItem(item.id);
  logStep(3.5, 'Outbox row synced', {
    ok: afterOutbox?.status === 'synced',
    detail: JSON.stringify(
      {
        id: afterOutbox?.id,
        status: afterOutbox?.status,
        syncedAt: afterOutbox?.syncedAt,
        lastError: afterOutbox?.lastError,
      },
      null,
      2
    ),
  });

  // ========== Step 4: Postgres ==========
  const rows = await query<{
    id: string;
    status: string;
    photo_evidence_url: string | null;
  }>(`SELECT id, status, photo_evidence_url FROM farmer_tasks WHERE id = $1`, [target.id]);
  const row = rows[0];
  const dbOk =
    row?.status === 'submitted' &&
    !!row.photo_evidence_url &&
    row.photo_evidence_url.startsWith('tasks/');

  logStep(4, 'Postgres farmer_tasks updated', {
    ok: dbOk,
    detail: JSON.stringify(row ?? null, null, 2),
  });
  if (!dbOk) fail('DB row not submitted with R2 key');

  stopOutboxConnectivitySync();
  console.log('\n========================================');
  console.log('PROOF PASSED — reconnect sync drains outbox');
  console.log(`farmer_task_id=${target.id}`);
  console.log(`outbox_id=${item.id} → synced via offline→online listener`);
  console.log('========================================\n');
  await closeDatabase().catch(() => undefined);
}

main().catch(async (err) => {
  console.error('\nPROOF CRASHED:', err);
  try {
    const { closeDatabase } = await import('../backend/src/db/database');
    await closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
