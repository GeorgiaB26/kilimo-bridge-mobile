/**
 * Proof: task_approval outbox + conflict → needs_review.
 *
 * Happy path: enqueue approve while offline-capable, sync succeeds.
 * Conflict: queue approve with expected submitted-for-approval, someone else
 * rejects in the meantime, processOutboxItem marks needs_review (does not approve).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-task-approval-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-task-approval-outbox.bundle.cjs
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
  console.log('Offline task_approval outbox — conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);

  const {
    setAuthToken,
    devQuickLogin,
    getAdminFarmerTasks,
    rejectFarmerTask,
  } = await import('../mobile/src/api/client');
  const {
    enqueueOutbox,
    getOutboxItem,
    deleteOutboxItem,
    listOutbox,
  } = await import('../mobile/src/services/offlineOutbox');
  const { processOutboxItem } = await import('../mobile/src/services/offlineOutboxProcessor');
  const { outboxStatusUserLabel } = await import('../mobile/src/services/offlineOutboxExpected');
  const { query, closeDatabase } = await import('../backend/src/db/database');

  const adminAuth = await devQuickLogin('+254700000001');
  if (!adminAuth?.token) fail(`admin dev-login failed: ${JSON.stringify(adminAuth)}`);
  setAuthToken(adminAuth.token);
  console.log(`\nAdmin ${adminAuth.user?.name} (${adminAuth.user?.role})`);

  // Clear leftover task_approval rows from prior proof runs
  const prior = await listOutbox({ actionType: 'task_approval', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  // Find or seed a submitted-for-approval task
  const listed = await getAdminFarmerTasks({});
  const tasks = (listed.tasks ?? []) as Array<{ id: string; name: string; status: string }>;
  let target = tasks.find((t) => t.status === 'submitted-for-approval');

  if (!target) {
    const any = tasks[0];
    if (!any) fail('No admin farmer tasks — seed hierarchy first');
    await query(
      `UPDATE farmer_tasks
       SET status = 'submitted',
           submitted_date = NOW(),
           approved_date = NULL,
           rejection_reason = NULL,
           notes = COALESCE(notes, 'proof seed'),
           updated_at = NOW()
       WHERE id = $1`,
      [any.id]
    );
    target = { ...any, status: 'submitted-for-approval' };
    console.log(`Seeded task ${any.id} (${any.name}) to submitted-for-approval`);
  }

  console.log(`Target task=${target.id} name="${target.name}" status=${target.status}`);

  // ---------- Happy path: approve succeeds when status still matches ----------
  const happyId = `proof-approve-ok-${Date.now()}`;
  await enqueueOutbox({
    id: happyId,
    actionType: 'task_approval',
    payload: {
      farmerTaskId: target.id,
      taskName: target.name,
      decision: 'approve',
      notes: 'proof happy-path approval',
      rejectionReason: '',
      expected: { status: 'submitted-for-approval' },
    },
  });

  const happyResult = await processOutboxItem(happyId);
  const happyItem = await getOutboxItem(happyId);
  const afterHappy = await query<{ status: string }>(
    `SELECT status FROM farmer_tasks WHERE id = $1`,
    [target.id]
  );
  // DB stores 'approved'; API maps submitted ↔ submitted-for-approval
  logStep(1, 'Happy path: approve applies when expected status matches', {
    ok:
      happyResult.ok === true &&
      happyItem?.status === 'synced' &&
      afterHappy[0]?.status === 'approved',
    detail: JSON.stringify(
      {
        processOk: happyResult.ok,
        outboxStatus: happyItem?.status,
        dbStatus: afterHappy[0]?.status,
      },
      null,
      2
    ),
  });
  if (!happyResult.ok) fail(`Happy path approve failed: ${happyResult.error}`);

  await deleteOutboxItem(happyId);

  // ---------- Conflict path: reset to submitted, queue approve, reject elsewhere ----------
  await query(
    `UPDATE farmer_tasks
     SET status = 'submitted',
         submitted_date = NOW(),
         approved_date = NULL,
         rejection_reason = NULL,
         notes = 'proof conflict seed',
         updated_at = NOW()
     WHERE id = $1`,
    [target.id]
  );

  const conflictId = `proof-approve-conflict-${Date.now()}`;
  await enqueueOutbox({
    id: conflictId,
    actionType: 'task_approval',
    payload: {
      farmerTaskId: target.id,
      taskName: target.name,
      decision: 'approve',
      notes: 'proof should NOT apply — conflict',
      rejectionReason: '',
      expected: { status: 'submitted-for-approval' },
    },
  });

  // Someone else rejects while approval is queued
  await rejectFarmerTask(target.id, 'Rejected by another admin during offline queue proof');

  const mid = await query<{ status: string; rejection_reason: string | null }>(
    `SELECT status, rejection_reason FROM farmer_tasks WHERE id = $1`,
    [target.id]
  );
  logStep(2, 'Meanwhile: another admin rejected the task', {
    ok: mid[0]?.status === 'rejected',
    detail: JSON.stringify(mid[0] ?? null, null, 2),
  });
  if (mid[0]?.status !== 'rejected') fail('Expected DB status rejected before sync');

  const conflictResult = await processOutboxItem(conflictId);
  const conflictItem = await getOutboxItem(conflictId);
  const afterConflict = await query<{ status: string; notes: string | null }>(
    `SELECT status, notes FROM farmer_tasks WHERE id = $1`,
    [target.id]
  );

  const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
  const message = conflictItem?.lastError ?? conflictResult.error ?? '';

  logStep(3, 'Sync detects conflict → needs_review (does not approve)', {
    ok:
      conflictResult.ok === false &&
      conflictResult.needsReview === true &&
      conflictItem?.status === 'needs_review' &&
      afterConflict[0]?.status === 'rejected' &&
      !String(afterConflict[0]?.notes ?? '').includes('proof should NOT apply') &&
      uiLabel === 'Needs your review' &&
      message.toLowerCase().includes('changed since') &&
      message.toLowerCase().includes('status'),
    detail: JSON.stringify(
      {
        processOk: conflictResult.ok,
        needsReview: conflictResult.needsReview,
        outboxStatus: conflictItem?.status,
        uiLabel,
        lastError: message,
        dbStatus: afterConflict[0]?.status,
        dbNotes: afterConflict[0]?.notes,
      },
      null,
      2
    ),
  });

  if (conflictItem?.status !== 'needs_review') {
    fail(`Expected needs_review, got ${conflictItem?.status}`);
  }
  if (afterConflict[0]?.status !== 'rejected') {
    fail('Blind approval overwrote the other admin’s rejection');
  }

  // Push must not re-claim needs_review
  const pushAgain = await processOutboxItem(conflictId);
  logStep(4, 'Push on needs_review is skipped (stays terminal)', {
    ok:
      pushAgain.ok === false &&
      pushAgain.needsReview === true &&
      pushAgain.skipped === true,
    detail: JSON.stringify(
      {
        ok: pushAgain.ok,
        needsReview: pushAgain.needsReview,
        skipped: pushAgain.skipped,
        error: pushAgain.error,
      },
      null,
      2
    ),
  });

  await deleteOutboxItem(conflictId);

  console.log('\n========================================');
  console.log('PROOF PASSED — task_approval conflict → needs_review');
  console.log(`UI label: ${uiLabel}`);
  console.log(`Conflict message: ${message}`);
  console.log('========================================\n');

  await closeDatabase();
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
