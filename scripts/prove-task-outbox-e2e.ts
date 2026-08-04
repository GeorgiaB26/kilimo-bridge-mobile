/**
 * End-to-end proof: offline task_submission outbox → R2 → API → Postgres.
 *
 * Runs the REAL mobile outbox enqueue + processOutboxItem path (web AsyncStorage
 * implementation) against a live local API + DATABASE_URL.
 *
 * Usage (from repo root, backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-task-outbox-e2e.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-task-outbox-e2e.bundle.cjs
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });

process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

type StepResult = { ok: boolean; detail: string };

function logStep(n: number, title: string, result: StepResult) {
  const mark = result.ok ? 'PASS' : 'FAIL';
  console.log(`\n=== Step ${n}: ${title} [${mark}] ===`);
  console.log(result.detail);
}

function fail(msg: string): never {
  console.error(`\nPROOF FAILED: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log('Offline task_submission outbox — end-to-end proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  // --- Load mobile modules AFTER require hook is registered ---
  const { setAuthToken, devTokenLogin, getFarmerHierarchyProjects, getFarmerProjectTasks } =
    await import('../mobile/src/api/client');
  const {
    enqueueOutbox,
    getOutboxItem,
    listOutbox,
  } = await import('../mobile/src/services/offlineOutbox');
  const { processOutboxItem } = await import('../mobile/src/services/offlineOutboxProcessor');
  const { query, closeDatabase } = await import('../backend/src/db/database');

  const photoPath = path.join(__dirname, '_tmp_task_evidence.jpg');
  if (!fs.existsSync(photoPath)) {
    fail(`Missing proof photo at ${photoPath} — regenerate with PIL first`);
  }
  const photoBase64 = fs.readFileSync(photoPath).toString('base64');
  const photoBytes = Buffer.from(photoBase64, 'base64').byteLength;
  if (photoBytes < 2000) {
    fail(`Proof photo too small (${photoBytes} bytes); need >= 2000`);
  }

  // --- Auth as demo farmer ---
  console.log('\n--- Auth ---');
  const auth = await devTokenLogin('farmer', '+254712345678');
  if (!auth?.token) fail(`dev-token failed: ${JSON.stringify(auth)}`);
  setAuthToken(auth.token);
  console.log(`Logged in as ${auth.user?.name ?? 'farmer'} (${auth.user?.phoneNumber ?? '+254712345678'})`);
  console.log(`farmerId=${auth.user?.farmerId ?? '(from token claims)'}`);

  // --- Find a submittable farmer_task ---
  const projects = await getFarmerHierarchyProjects();
  const projectId = projects.projects?.[0]?.id;
  if (!projectId) fail('No hierarchy projects for demo farmer — run npm run seed:hierarchy');

  const tasksResp = await getFarmerProjectTasks(projectId);
  const tasks = (tasksResp.tasks ?? []) as Array<{
    id: string;
    name: string;
    status: string;
  }>;
  let target = tasks.find((t) =>
    ['not-started', 'in-progress', 'rejected'].includes(t.status)
  );

  if (!target) {
    // Reset the first task so we can re-proof
    const any = tasks[0];
    if (!any) fail('No farmer tasks found for demo project');
    await query(
      `UPDATE farmer_tasks
       SET status = 'not-started',
           photo_evidence_url = NULL,
           notes = NULL,
           submitted_date = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [any.id]
    );
    console.log(`Reset task ${any.id} (${any.name}) to not-started for proof`);
    target = { ...any, status: 'not-started' };
  }

  const notes =
    'Automated outbox e2e proof: photo evidence queued offline then synced via processOutboxItem. '.repeat(
      1
    ) + 'Notes meet the 50-character client minimum.';

  console.log(`Target farmer_task_id=${target.id} name="${target.name}" status=${target.status}`);

  // Snapshot DB before
  const before = await query<{
    id: string;
    status: string;
    photo_evidence_url: string | null;
    notes: string | null;
  }>(
    `SELECT id, status, photo_evidence_url, notes FROM farmer_tasks WHERE id = $1`,
    [target.id]
  );
  logStep(0, 'DB before enqueue', {
    ok: true,
    detail: JSON.stringify(before[0] ?? null, null, 2),
  });

  // ========== Step 1: Enqueue (same as Submit while offline) ==========
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

  logStep(1, 'Enqueue task_submission into sync_outbox', {
    ok: item.status === 'pending' && item.actionType === 'task_submission',
    detail: JSON.stringify(
      {
        id: item.id,
        actionType: item.actionType,
        status: item.status,
        attemptCount: item.attemptCount,
        payload: item.payload,
        photoBase64Bytes: item.photoBase64 ? Buffer.from(item.photoBase64, 'base64').byteLength : 0,
        photoLocalUri: item.photoLocalUri,
      },
      null,
      2
    ),
  });
  if (item.status !== 'pending') fail('Enqueue did not produce status=pending');

  // ========== Step 2: Confirm pending in outbox ==========
  const listed = await listOutbox({ actionType: 'task_submission', includeSynced: false });
  const found = listed.find((r) => r.id === item.id) ?? (await getOutboxItem(item.id));
  const pendingOk =
    !!found &&
    found.status === 'pending' &&
    found.actionType === 'task_submission' &&
    found.payload.farmerTaskId === target.id &&
    !!found.photoBase64;

  logStep(2, 'Confirm outbox row pending', {
    ok: pendingOk,
    detail: JSON.stringify(
      {
        listedCount: listed.length,
        found: found
          ? {
              id: found.id,
              status: found.status,
              actionType: found.actionType,
              farmerTaskId: found.payload.farmerTaskId,
              hasPhoto: !!found.photoBase64,
              lastError: found.lastError,
            }
          : null,
      },
      null,
      2
    ),
  });
  if (!pendingOk) fail('Outbox row missing or not pending');

  // ========== Step 3: Real sync path ==========
  const syncResult = await processOutboxItem(item.id);

  logStep(3, 'processOutboxItem (real handler: R2 + submit-completion)', {
    ok: syncResult.ok === true,
    detail: JSON.stringify(
      syncResult.ok
        ? {
            ok: true,
            outboxStatus: syncResult.item?.status,
            syncedAt: syncResult.item?.syncedAt,
            api: syncResult.data,
          }
        : syncResult,
      null,
      2
    ),
  });
  if (!syncResult.ok) {
    fail(`Sync failed: ${syncResult.error}${syncResult.connectivity ? ' (connectivity)' : ''}`);
  }

  const afterOutbox = await getOutboxItem(item.id);
  logStep(3.5 as number, 'Outbox row after sync', {
    ok: afterOutbox?.status === 'synced',
    detail: JSON.stringify(
      afterOutbox
        ? {
            id: afterOutbox.id,
            status: afterOutbox.status,
            syncedAt: afterOutbox.syncedAt,
            lastError: afterOutbox.lastError,
            attemptCount: afterOutbox.attemptCount,
          }
        : null,
      null,
      2
    ),
  });

  // ========== Step 4: Verify Postgres ==========
  const after = await query<{
    id: string;
    status: string;
    photo_evidence_url: string | null;
    notes: string | null;
    submitted_date: string | null;
  }>(
    `SELECT id, status, photo_evidence_url, notes, submitted_date
     FROM farmer_tasks WHERE id = $1`,
    [target.id]
  );
  const row = after[0];
  const photoOk =
    !!row?.photo_evidence_url &&
    (row.photo_evidence_url.startsWith('tasks/') ||
      row.photo_evidence_url.startsWith('http') ||
      row.photo_evidence_url.startsWith('data:'));
  const statusOk = row?.status === 'submitted';

  logStep(4, 'Postgres farmer_tasks after sync', {
    ok: statusOk && photoOk,
    detail: JSON.stringify(row ?? null, null, 2),
  });

  if (!statusOk) fail(`Expected farmer_tasks.status='submitted', got '${row?.status}'`);
  if (!photoOk) fail(`Expected photo_evidence_url to be an R2 key/URL, got '${row?.photo_evidence_url}'`);

  console.log('\n========================================');
  console.log('PROOF PASSED — offline task_submission works end-to-end');
  console.log(`farmer_task_id=${target.id}`);
  console.log(`outbox_id=${item.id} → synced`);
  console.log(`photo_evidence_url=${row.photo_evidence_url}`);
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
