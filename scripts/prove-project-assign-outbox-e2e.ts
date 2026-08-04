/**
 * Proof: project_assign outbox + conflict → needs_review.
 *
 * Pins the sorted enrolled farmer_id set on the program project
 * (assign does not bump program_projects.updated_at).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-project-assign-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-project-assign-outbox.bundle.cjs
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

function sortedIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

async function main() {
  console.log('Offline project_assign outbox — conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);
  console.log('Authoritative pin: enrolled farmer_id set on the project');

  const {
    setAuthToken,
    devQuickLogin,
    getProgramProjects,
    getProgramProject,
    getFarmers,
    assignFarmersToProgramProject,
  } = await import('../mobile/src/api/client');
  const {
    enqueueOutbox,
    getOutboxItem,
    deleteOutboxItem,
    listOutbox,
  } = await import('../mobile/src/services/offlineOutbox');
  const { processOutboxItem } = await import('../mobile/src/services/offlineOutboxProcessor');
  const { outboxStatusUserLabel } = await import('../mobile/src/services/offlineOutboxExpected');
  const { closeDatabase } = await import('../backend/src/db/database');

  const adminAuth = await devQuickLogin('+254700000001');
  if (!adminAuth?.token) fail(`admin dev-login failed: ${JSON.stringify(adminAuth)}`);
  setAuthToken(adminAuth.token);
  console.log(`\nAdmin ${adminAuth.user?.name} (${adminAuth.user?.role})`);

  const prior = await listOutbox({ actionType: 'project_assign', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  const projectsResp = await getProgramProjects();
  const projectId = projectsResp.projects?.[0]?.id as string | undefined;
  if (!projectId) fail('No program projects — run hierarchy seed');

  const farmersResp = await getFarmers(50, 0);
  const allFarmerIds = ((farmersResp.farmers ?? []) as Array<{ farmer_id: string }>).map(
    (f) => f.farmer_id
  );
  if (allFarmerIds.length < 2) fail('Need at least 2 farmers for assign proof');

  let project = await getProgramProject(projectId);
  const projectName = project?.name ?? 'Project';
  console.log(`Target project=${projectId} name="${projectName}"`);

  const baselineIds = sortedIds(
    ((project?.farmers ?? []) as Array<{ farmer_id: string }>).map((f) => f.farmer_id)
  );
  logStep(0, 'Baseline enrolled farmer set', {
    ok: true,
    detail: JSON.stringify({ count: baselineIds.length, projectName }, null, 2),
  });

  const notEnrolled = allFarmerIds.filter((id) => !baselineIds.includes(id));
  // Prefer assigning not-yet-enrolled farmers; fall back to re-assign (idempotent) for happy path
  const happyAssignIds = sortedIds(
    (notEnrolled.length > 0 ? notEnrolled : allFarmerIds).slice(0, Math.min(3, allFarmerIds.length))
  );

  // ---------- Happy path ----------
  const happyId = `proof-assign-ok-${Date.now()}`;
  await enqueueOutbox({
    id: happyId,
    actionType: 'project_assign',
    payload: {
      projectId,
      projectName,
      farmerIds: happyAssignIds,
      expected: { farmerIds: baselineIds },
    },
  });

  const happyResult = await processOutboxItem(happyId);
  const happyItem = await getOutboxItem(happyId);
  project = await getProgramProject(projectId);
  const afterHappyIds = sortedIds(
    ((project?.farmers ?? []) as Array<{ farmer_id: string }>).map((f) => f.farmer_id)
  );
  const happyCovered = happyAssignIds.every((id) => afterHappyIds.includes(id));

  logStep(1, 'Happy path: assign applies when enrolled set still matches', {
    ok: happyResult.ok === true && happyItem?.status === 'synced' && happyCovered,
    detail: JSON.stringify(
      {
        processOk: happyResult.ok,
        outboxStatus: happyItem?.status,
        assigned: happyAssignIds.length,
        enrolledBefore: baselineIds.length,
        enrolledAfter: afterHappyIds.length,
      },
      null,
      2
    ),
  });
  if (!happyResult.ok) fail(`Happy path assign failed: ${happyResult.error}`);
  await deleteOutboxItem(happyId);

  // ---------- Conflict path ----------
  const conflictBaseline = afterHappyIds;
  const stillFree = allFarmerIds.filter((id) => !conflictBaseline.includes(id));
  if (stillFree.length < 2) {
    fail(
      'Need two farmers not yet enrolled on this project for conflict proof — register more farmers or use another project'
    );
  }

  const queuedFarmer = stillFree[0];
  const interveningFarmer = stillFree[1];

  const conflictId = `proof-assign-conflict-${Date.now()}`;
  await enqueueOutbox({
    id: conflictId,
    actionType: 'project_assign',
    payload: {
      projectId,
      projectName,
      farmerIds: [queuedFarmer],
      expected: { farmerIds: conflictBaseline },
    },
  });

  // Someone else assigns a different farmer while our assign is queued
  await assignFarmersToProgramProject(projectId, [interveningFarmer]);
  project = await getProgramProject(projectId);
  const midIds = sortedIds(
    ((project?.farmers ?? []) as Array<{ farmer_id: string }>).map((f) => f.farmer_id)
  );

  logStep(2, 'Meanwhile: another actor changed the enrolled farmer set', {
    ok:
      midIds.includes(interveningFarmer) &&
      JSON.stringify(midIds) !== JSON.stringify(conflictBaseline),
    detail: JSON.stringify(
      {
        expectedAtEnqueue: conflictBaseline.length,
        afterInterveningCount: midIds.length,
        interveningFarmer,
        queuedFarmer,
      },
      null,
      2
    ),
  });

  const conflictResult = await processOutboxItem(conflictId);
  const conflictItem = await getOutboxItem(conflictId);
  project = await getProgramProject(projectId);
  const afterConflictIds = sortedIds(
    ((project?.farmers ?? []) as Array<{ farmer_id: string }>).map((f) => f.farmer_id)
  );

  const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
  const message = conflictItem?.lastError ?? conflictResult.error ?? '';

  logStep(3, 'Sync detects conflict → needs_review (does not apply queued assign)', {
    ok:
      conflictResult.ok === false &&
      conflictResult.needsReview === true &&
      conflictItem?.status === 'needs_review' &&
      !afterConflictIds.includes(queuedFarmer) &&
      afterConflictIds.includes(interveningFarmer) &&
      uiLabel === 'Needs your review' &&
      message.toLowerCase().includes('changed since') &&
      message.toLowerCase().includes('farmerids'),
    detail: JSON.stringify(
      {
        processOk: conflictResult.ok,
        needsReview: conflictResult.needsReview,
        outboxStatus: conflictItem?.status,
        uiLabel,
        lastError: message,
        enrolledAfter: afterConflictIds.length,
        queuedFarmerApplied: afterConflictIds.includes(queuedFarmer),
      },
      null,
      2
    ),
  });

  if (conflictItem?.status !== 'needs_review') {
    fail(`Expected needs_review, got ${conflictItem?.status}`);
  }
  if (afterConflictIds.includes(queuedFarmer)) {
    fail('Blind assign applied despite enrolled-set conflict');
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
  console.log('PROOF PASSED — project_assign conflict → needs_review');
  console.log('Pinned field: enrolled farmer_id set');
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
