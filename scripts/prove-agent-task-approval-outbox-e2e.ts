/**
 * Proof: agent_task_approval outbox + conflict → needs_review.
 *
 * Happy path: enqueue approve while status matches submitted-for-approval → synced.
 * Conflict: queue approve with expected submitted-for-approval, someone else
 * rejects in the meantime, processOutboxItem marks needs_review (does not approve).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-agent-task-approval-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-agent-task-approval-outbox.bundle.cjs
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
  console.log('Offline agent_task_approval outbox — conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);
  console.log('Authoritative pin field: agent_tasks.status (submitted-for-approval)');

  const { setAuthToken, devTokenLogin, rejectAgentPersonalTask, getAgentTasks } =
    await import('../mobile/src/api/client');
  const {
    enqueueOutbox,
    getOutboxItem,
    deleteOutboxItem,
    listOutbox,
  } = await import('../mobile/src/services/offlineOutbox');
  const { processOutboxItem } = await import('../mobile/src/services/offlineOutboxProcessor');
  const { outboxStatusUserLabel } = await import('../mobile/src/services/offlineOutboxExpected');
  const { query, closeDatabase } = await import('../backend/src/db/database');

  const agentAuth = await devTokenLogin('field_agent');
  if (!agentAuth?.token) fail(`agent dev-token failed: ${JSON.stringify(agentAuth)}`);
  setAuthToken(agentAuth.token);
  const agentUserId = agentAuth.user?.userId;
  if (!agentUserId) fail(`agent user id missing: ${JSON.stringify(agentAuth.user)}`);
  console.log(`\nAgent ${agentAuth.user?.name} (${agentAuth.user?.role}) id=${agentUserId}`);

  const prior = await listOutbox({ actionType: 'agent_task_approval', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  // Find or seed a submitted_for_approval agent task owned by this agent
  const listed = await getAgentTasks();
  const personal = (listed.personal_tasks ?? []) as Array<{
    id: string;
    name: string;
    status: string;
  }>;
  let target = personal.find(
    (t) =>
      t.status === 'submitted-for-approval' ||
      t.status === 'submitted_for_approval' ||
      t.status === 'submitted'
  );

  if (!target) {
    const any = personal[0];
    if (any) {
      await query(
        `UPDATE agent_tasks
         SET status = 'submitted_for_approval',
             submitted_at = NOW(),
             reviewed_at = NULL,
             rejection_reason = NULL,
             notes = COALESCE(NULLIF(TRIM(notes), ''), 'proof seed notes for agent task approval'),
             photo_evidence_url = COALESCE(
               NULLIF(TRIM(photo_evidence_url), ''),
               'https://example.com/proof-agent-task.jpg'
             ),
             updated_at = NOW()
         WHERE id = $1 AND agent_user_id = $2`,
        [any.id, agentUserId]
      );
      target = { ...any, status: 'submitted-for-approval' };
      console.log(`Seeded agent task ${any.id} (${any.name}) to submitted_for_approval`);
    } else {
      const id = `proof-agent-task-${Date.now()}`;
      await query(
        `INSERT INTO agent_tasks (
           id, agent_user_id, name, description, due_date, priority, status,
           notes, photo_evidence_url, submitted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'medium', 'submitted_for_approval',
           $6, $7, NOW(), NOW(), NOW()
         )`,
        [
          id,
          agentUserId,
          'Proof agent assignment review',
          'Seeded for agent_task_approval outbox proof',
          new Date().toISOString().slice(0, 10),
          'proof seed notes for agent task approval — long enough',
          'https://example.com/proof-agent-task.jpg',
        ]
      );
      target = {
        id,
        name: 'Proof agent assignment review',
        status: 'submitted-for-approval',
      };
      console.log(`Inserted agent task ${id} at submitted_for_approval`);
    }
  }

  console.log(`Target task=${target.id} name="${target.name}" status=${target.status}`);

  // ---------- Happy path ----------
  const happyId = `proof-agent-approve-ok-${Date.now()}`;
  await enqueueOutbox({
    id: happyId,
    actionType: 'agent_task_approval',
    payload: {
      agentTaskId: target.id,
      taskName: target.name,
      decision: 'approve',
      notes: 'proof happy-path agent approval',
      rejectionReason: '',
      expected: { status: 'submitted-for-approval' },
    },
  });

  const happyResult = await processOutboxItem(happyId);
  const happyItem = await getOutboxItem(happyId);
  const afterHappy = await query<{ status: string }>(
    `SELECT status FROM agent_tasks WHERE id = $1`,
    [target.id]
  );
  logStep(1, 'Happy path: approve applies when expected status matches', {
    ok: happyResult.ok === true && afterHappy[0]?.status === 'approved',
    detail: JSON.stringify(
      {
        processOk: happyResult.ok,
        processError: happyResult.error,
        // Web outbox may prune synced rows immediately — DB status is authoritative.
        outboxStatus: happyItem?.status ?? '(pruned after sync)',
        dbStatus: afterHappy[0]?.status,
      },
      null,
      2
    ),
  });
  if (!happyResult.ok || afterHappy[0]?.status !== 'approved') {
    fail(`Happy path approve failed: ${happyResult.error ?? afterHappy[0]?.status}`);
  }

  await deleteOutboxItem(happyId);

  // ---------- Conflict path ----------
  await query(
    `UPDATE agent_tasks
     SET status = 'submitted_for_approval',
         submitted_at = NOW(),
         reviewed_at = NULL,
         rejection_reason = NULL,
         notes = 'proof conflict seed',
         updated_at = NOW()
     WHERE id = $1 AND agent_user_id = $2`,
    [target.id, agentUserId]
  );

  const conflictId = `proof-agent-approve-conflict-${Date.now()}`;
  await enqueueOutbox({
    id: conflictId,
    actionType: 'agent_task_approval',
    payload: {
      agentTaskId: target.id,
      taskName: target.name,
      decision: 'approve',
      notes: 'proof should NOT apply — conflict',
      rejectionReason: '',
      expected: { status: 'submitted-for-approval' },
    },
  });

  // Someone else rejects while approval is queued
  await rejectAgentPersonalTask(
    target.id,
    'Rejected by another reviewer during offline queue proof'
  );

  const mid = await query<{ status: string; rejection_reason: string | null }>(
    `SELECT status, rejection_reason FROM agent_tasks WHERE id = $1`,
    [target.id]
  );
  logStep(2, 'Meanwhile: another reviewer rejected the task', {
    ok: mid[0]?.status === 'rejected',
    detail: JSON.stringify(mid[0] ?? null, null, 2),
  });
  if (mid[0]?.status !== 'rejected') fail('Expected DB status rejected before sync');

  const conflictResult = await processOutboxItem(conflictId);
  const conflictItem = await getOutboxItem(conflictId);
  const afterConflict = await query<{ status: string; notes: string | null }>(
    `SELECT status, notes FROM agent_tasks WHERE id = $1`,
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
    fail('Blind approval overwrote the other reviewer’s rejection');
  }

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
  console.log('PROOF PASSED — agent_task_approval conflict → needs_review');
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
