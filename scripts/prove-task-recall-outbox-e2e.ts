/**
 * Proof: task_recall outbox + conflict → needs_review.
 *
 * Covers BOTH sources in one slice:
 *   - agent_assignment (agent_tasks)
 *   - hierarchy (farmer_tasks)
 *
 * Happy path: enqueue recall while status is submitted-for-approval → synced,
 *   DB status becomes in_progress / in-progress, photo + notes kept.
 * Conflict: queue recall with expected submitted-for-approval, reviewer approves
 *   meanwhile → needs_review; approval stands (recall does not overwrite).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-task-recall-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-task-recall-outbox.bundle.cjs
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

function normalizeStatus(status: string): string {
  const s = status.trim().toLowerCase().replace(/_/g, '-');
  if (s === 'submitted') return 'submitted-for-approval';
  return s;
}

async function main() {
  console.log('Offline task_recall outbox — happy path + conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);
  console.log('Pin field: status === submitted-for-approval (both sources)');

  const {
    setAuthToken,
    devTokenLogin,
    approveAgentPersonalTask,
    getFarmerAssignedTasks,
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

  const prior = await listOutbox({ actionType: 'task_recall', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  // ---------- Farmer auth ----------
  const farmerAuth = await devTokenLogin('farmer');
  if (!farmerAuth?.token) fail(`farmer dev-token failed: ${JSON.stringify(farmerAuth)}`);
  setAuthToken(farmerAuth.token);
  const farmerId = farmerAuth.user?.farmerId;
  if (!farmerId) fail(`farmer id missing: ${JSON.stringify(farmerAuth.user)}`);
  console.log(`\nFarmer ${farmerAuth.user?.name} id=${farmerId}`);

  // ---------- A) agent_assignment happy + conflict ----------
  {
    console.log('\n-------- Source: agent_assignment --------');

    const agentAuth = await devTokenLogin('field_agent');
    if (!agentAuth?.token) fail(`agent dev-token failed: ${JSON.stringify(agentAuth)}`);
    const agentUserId = agentAuth.user?.userId;
    if (!agentUserId) fail(`agent user id missing: ${JSON.stringify(agentAuth.user)}`);

    // Seed / find an agent task assigned to this farmer at submitted_for_approval
    const seededNotes =
      'proof recall seed notes for agent assignment — long enough for min length';
    const seededPhoto = 'https://example.com/proof-agent-recall.jpg';

    let agentTask = (
      await query<{
        id: string;
        name: string;
        status: string;
        notes: string | null;
        photo_evidence_url: string | null;
        assigned_farmer_ids: string | null;
      }>(
        `SELECT id, name, status, notes, photo_evidence_url, assigned_farmer_ids
         FROM agent_tasks
         WHERE agent_user_id = $1
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 20`,
        [agentUserId]
      )
    ).find((row) => {
      try {
        const ids = JSON.parse(row.assigned_farmer_ids || '[]');
        return Array.isArray(ids) && ids.map(String).includes(farmerId);
      } catch {
        return false;
      }
    });

    if (!agentTask) {
      const id = `proof-recall-agent-${Date.now()}`;
      await query(
        `INSERT INTO agent_tasks (
           id, agent_user_id, name, description, due_date, priority, status,
           assigned_farmer_ids, notes, photo_evidence_url, submitted_at, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'medium', 'submitted_for_approval',
           $6, $7, $8, NOW(), NOW(), NOW()
         )`,
        [
          id,
          agentUserId,
          'Proof agent recall task',
          'Seeded for task_recall outbox proof',
          new Date().toISOString().slice(0, 10),
          JSON.stringify([farmerId]),
          seededNotes,
          seededPhoto,
        ]
      );
      agentTask = {
        id,
        name: 'Proof agent recall task',
        status: 'submitted_for_approval',
        notes: seededNotes,
        photo_evidence_url: seededPhoto,
        assigned_farmer_ids: JSON.stringify([farmerId]),
      };
      console.log(`Inserted agent task ${id}`);
    } else {
      await query(
        `UPDATE agent_tasks
         SET status = 'submitted_for_approval',
             submitted_at = NOW(),
             reviewed_at = NULL,
             rejection_reason = NULL,
             notes = COALESCE(NULLIF(TRIM(notes), ''), $2),
             photo_evidence_url = COALESCE(NULLIF(TRIM(photo_evidence_url), ''), $3),
             updated_at = NOW()
         WHERE id = $1`,
        [agentTask.id, seededNotes, seededPhoto]
      );
      agentTask = {
        ...agentTask,
        status: 'submitted_for_approval',
        notes: agentTask.notes?.trim() || seededNotes,
        photo_evidence_url: agentTask.photo_evidence_url?.trim() || seededPhoto,
      };
      console.log(`Seeded agent task ${agentTask.id} (${agentTask.name})`);
    }

    // A1 happy path
    setAuthToken(farmerAuth.token);
    const happyId = `proof-recall-agent-ok-${Date.now()}`;
    await enqueueOutbox({
      id: happyId,
      actionType: 'task_recall',
      payload: {
        taskId: agentTask.id,
        taskName: agentTask.name,
        source: 'agent_assignment',
        expected: { status: 'submitted-for-approval' },
      },
    });

    const happyResult = await processOutboxItem(happyId);
    const afterHappy = await query<{
      status: string;
      notes: string | null;
      photo_evidence_url: string | null;
    }>(`SELECT status, notes, photo_evidence_url FROM agent_tasks WHERE id = $1`, [agentTask.id]);

    logStep('A1', 'Happy path agent recall → in_progress, evidence kept', {
      ok:
        happyResult.ok === true &&
        normalizeStatus(afterHappy[0]?.status ?? '') === 'in-progress' &&
        Boolean(afterHappy[0]?.notes?.trim()) &&
        Boolean(afterHappy[0]?.photo_evidence_url?.trim()),
      detail: JSON.stringify(
        {
          processOk: happyResult.ok,
          processError: happyResult.error,
          dbStatus: afterHappy[0]?.status,
          notesKept: afterHappy[0]?.notes,
          photoKept: afterHappy[0]?.photo_evidence_url,
        },
        null,
        2
      ),
    });
    if (
      !happyResult.ok ||
      normalizeStatus(afterHappy[0]?.status ?? '') !== 'in-progress' ||
      !afterHappy[0]?.notes?.trim() ||
      !afterHappy[0]?.photo_evidence_url?.trim()
    ) {
      fail(`Agent happy-path recall failed: ${happyResult.error ?? afterHappy[0]?.status}`);
    }
    await deleteOutboxItem(happyId);

    // A2 conflict: re-submit status, queue recall, agent approves first
    await query(
      `UPDATE agent_tasks
       SET status = 'submitted_for_approval',
           submitted_at = NOW(),
           reviewed_at = NULL,
           rejection_reason = NULL,
           notes = $2,
           photo_evidence_url = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [agentTask.id, seededNotes, seededPhoto]
    );

    const conflictId = `proof-recall-agent-conflict-${Date.now()}`;
    setAuthToken(farmerAuth.token);
    await enqueueOutbox({
      id: conflictId,
      actionType: 'task_recall',
      payload: {
        taskId: agentTask.id,
        taskName: agentTask.name,
        source: 'agent_assignment',
        expected: { status: 'submitted-for-approval' },
      },
    });

    setAuthToken(agentAuth.token);
    await approveAgentPersonalTask(agentTask.id, 'Approved during offline recall queue proof');

    const mid = await query<{ status: string }>(
      `SELECT status FROM agent_tasks WHERE id = $1`,
      [agentTask.id]
    );
    logStep('A2', 'Meanwhile: agent approved the submission', {
      ok: normalizeStatus(mid[0]?.status ?? '') === 'approved',
      detail: JSON.stringify(mid[0] ?? null, null, 2),
    });
    if (normalizeStatus(mid[0]?.status ?? '') !== 'approved') {
      fail('Expected agent task approved before recall sync');
    }

    setAuthToken(farmerAuth.token);
    const conflictResult = await processOutboxItem(conflictId);
    const conflictItem = await getOutboxItem(conflictId);
    const afterConflict = await query<{
      status: string;
      notes: string | null;
      photo_evidence_url: string | null;
    }>(`SELECT status, notes, photo_evidence_url FROM agent_tasks WHERE id = $1`, [agentTask.id]);

    const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
    const message = conflictItem?.lastError ?? conflictResult.error ?? '';

    logStep('A3', 'Sync detects conflict → needs_review (does not recall)', {
      ok:
        conflictResult.ok === false &&
        conflictResult.needsReview === true &&
        conflictItem?.status === 'needs_review' &&
        normalizeStatus(afterConflict[0]?.status ?? '') === 'approved' &&
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
          notes: afterConflict[0]?.notes,
          photo: afterConflict[0]?.photo_evidence_url,
        },
        null,
        2
      ),
    });

    if (conflictItem?.status !== 'needs_review') {
      fail(`Expected needs_review, got ${conflictItem?.status}`);
    }
    if (normalizeStatus(afterConflict[0]?.status ?? '') !== 'approved') {
      fail('Blind recall overwrote the agent approval');
    }

    const pushAgain = await processOutboxItem(conflictId);
    logStep('A4', 'Push on needs_review is skipped (stays terminal)', {
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
  }

  // ---------- B) hierarchy happy + conflict ----------
  {
    console.log('\n-------- Source: hierarchy --------');
    setAuthToken(farmerAuth.token);

    const listed = await getFarmerAssignedTasks();
    const hierarchyTasks = ((listed.tasks ?? []) as Array<{
      id: string;
      name: string;
      status: string;
      source?: string;
      notes?: string | null;
      photo_evidence_url?: string | null;
    }>).filter((t) => t.source !== 'agent_assignment');

    let target = hierarchyTasks[0];
    if (!target) fail('No hierarchy farmer tasks for this farmer — seed program tasks first');

    const seededNotes =
      'proof recall seed notes for hierarchy task — long enough for min length';
    const seededPhoto = 'https://example.com/proof-hierarchy-recall.jpg';

    await query(
      `UPDATE farmer_tasks
       SET status = 'submitted',
           submitted_date = NOW(),
           approved_date = NULL,
           rejection_reason = NULL,
           notes = $2,
           photo_evidence_url = $3,
           updated_at = NOW()
       WHERE id = $1 AND farmer_id = $4`,
      [target.id, seededNotes, seededPhoto, farmerId]
    );
    target = { ...target, status: 'submitted-for-approval', notes: seededNotes };
    console.log(`Seeded hierarchy task ${target.id} (${target.name})`);

    const happyId = `proof-recall-hier-ok-${Date.now()}`;
    await enqueueOutbox({
      id: happyId,
      actionType: 'task_recall',
      payload: {
        taskId: target.id,
        taskName: target.name,
        source: 'hierarchy',
        expected: { status: 'submitted-for-approval' },
      },
    });

    const happyResult = await processOutboxItem(happyId);
    const afterHappy = await query<{
      status: string;
      notes: string | null;
      photo_evidence_url: string | null;
    }>(
      `SELECT status, notes, photo_evidence_url FROM farmer_tasks WHERE id = $1`,
      [target.id]
    );

    logStep('B1', 'Happy path hierarchy recall → in-progress, evidence kept', {
      ok:
        happyResult.ok === true &&
        normalizeStatus(afterHappy[0]?.status ?? '') === 'in-progress' &&
        Boolean(afterHappy[0]?.notes?.trim()) &&
        Boolean(afterHappy[0]?.photo_evidence_url?.trim()),
      detail: JSON.stringify(
        {
          processOk: happyResult.ok,
          processError: happyResult.error,
          dbStatus: afterHappy[0]?.status,
          notesKept: afterHappy[0]?.notes,
          photoKept: afterHappy[0]?.photo_evidence_url,
        },
        null,
        2
      ),
    });
    if (
      !happyResult.ok ||
      normalizeStatus(afterHappy[0]?.status ?? '') !== 'in-progress' ||
      !afterHappy[0]?.notes?.trim() ||
      !afterHappy[0]?.photo_evidence_url?.trim()
    ) {
      fail(`Hierarchy happy-path recall failed: ${happyResult.error ?? afterHappy[0]?.status}`);
    }
    await deleteOutboxItem(happyId);

    // Conflict: re-submit, queue recall, concurrent approve changes status
    await query(
      `UPDATE farmer_tasks
       SET status = 'submitted',
           submitted_date = NOW(),
           approved_date = NULL,
           rejection_reason = NULL,
           notes = $2,
           photo_evidence_url = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [target.id, seededNotes, seededPhoto]
    );

    const conflictId = `proof-recall-hier-conflict-${Date.now()}`;
    setAuthToken(farmerAuth.token);
    await enqueueOutbox({
      id: conflictId,
      actionType: 'task_recall',
      payload: {
        taskId: target.id,
        taskName: target.name,
        source: 'hierarchy',
        expected: { status: 'submitted-for-approval' },
      },
    });

    // Concurrent reviewer decision (reject avoids payment unique-constraint on
    // re-approve). Status leaving submitted is enough to trip the pin.
    await query(
      `UPDATE farmer_tasks
       SET status = 'rejected',
           rejection_reason = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [target.id, 'Rejected during offline hierarchy recall proof']
    );

    const mid = await query<{ status: string }>(
      `SELECT status FROM farmer_tasks WHERE id = $1`,
      [target.id]
    );
    logStep('B2', 'Meanwhile: reviewer rejected the hierarchy task', {
      ok: normalizeStatus(mid[0]?.status ?? '') === 'rejected',
      detail: JSON.stringify(mid[0] ?? null, null, 2),
    });
    if (normalizeStatus(mid[0]?.status ?? '') !== 'rejected') {
      fail('Expected hierarchy task rejected before recall sync');
    }

    setAuthToken(farmerAuth.token);
    const conflictResult = await processOutboxItem(conflictId);
    const conflictItem = await getOutboxItem(conflictId);
    const afterConflict = await query<{ status: string; notes: string | null }>(
      `SELECT status, notes FROM farmer_tasks WHERE id = $1`,
      [target.id]
    );

    const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
    const message = conflictItem?.lastError ?? conflictResult.error ?? '';

    logStep('B3', 'Sync detects conflict → needs_review (does not recall)', {
      ok:
        conflictResult.ok === false &&
        conflictResult.needsReview === true &&
        conflictItem?.status === 'needs_review' &&
        normalizeStatus(afterConflict[0]?.status ?? '') === 'rejected' &&
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
    if (normalizeStatus(afterConflict[0]?.status ?? '') !== 'rejected') {
      fail('Blind recall overwrote the reviewer rejection');
    }

    const pushAgain = await processOutboxItem(conflictId);
    logStep('B4', 'Push on needs_review is skipped (stays terminal)', {
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
  }

  console.log('\n========================================');
  console.log('PROOF PASSED — task_recall conflict → needs_review');
  console.log('Sources covered: agent_assignment + hierarchy');
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
