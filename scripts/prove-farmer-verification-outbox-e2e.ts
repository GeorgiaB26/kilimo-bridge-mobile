/**
 * Proof: farmer_verification outbox + conflict → needs_review.
 *
 * Pins farmers.status (authoritative). Decision body uses verification_status
 * verified|rejected, which writes farmers.status.
 *
 * Happy path: queue verify while status is pending_field_verification → synced.
 * Conflict: queue verify, another actor rejects meanwhile → needs_review, no overwrite.
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-farmer-verification-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-farmer-verification-outbox.bundle.cjs
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
  console.log('Offline farmer_verification outbox — conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);
  console.log('Authoritative pin field: farmers.status (pending_field_verification)');

  const { setAuthToken, devTokenLogin, verifyFarmerField, api } =
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
  console.log(`\nAgent ${agentAuth.user?.name} (${agentAuth.user?.role})`);

  const prior = await listOutbox({ actionType: 'farmer_verification', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  const farmersRes = await api.get('/agents/farmers');
  const farmers = (farmersRes.data?.farmers ?? []) as Array<{
    farmer_id: string;
    name: string;
    status: string;
  }>;
  if (farmers.length === 0) fail('No farmers visible to field agent');

  let target = farmers.find((f) => f.status === 'pending_field_verification');
  if (!target) {
    const any = farmers[0];
    await query(
      `UPDATE farmers
       SET status = 'pending_field_verification', updated_at = NOW()
       WHERE farmer_id = $1`,
      [any.farmer_id]
    );
    target = { ...any, status: 'pending_field_verification' };
    console.log(`Seeded farmer ${any.farmer_id} (${any.name}) to pending_field_verification`);
  }

  console.log(
    `Target farmer=${target.farmer_id} name="${target.name}" status=${target.status}`
  );

  // ---------- Happy path ----------
  const happyId = `proof-verify-ok-${Date.now()}`;
  await enqueueOutbox({
    id: happyId,
    actionType: 'farmer_verification',
    payload: {
      farmerId: target.farmer_id,
      farmerName: target.name,
      verificationStatus: 'verified',
      notes: 'proof happy-path field verification',
      expected: { status: 'pending_field_verification' },
    },
  });

  const happyResult = await processOutboxItem(happyId);
  const happyItem = await getOutboxItem(happyId);
  const afterHappy = await query<{ status: string }>(
    `SELECT status FROM farmers WHERE farmer_id = $1`,
    [target.farmer_id]
  );
  logStep(1, 'Happy path: verify applies when farmers.status still matches', {
    ok:
      happyResult.ok === true &&
      happyItem?.status === 'synced' &&
      afterHappy[0]?.status === 'verified',
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
  if (!happyResult.ok) fail(`Happy path verify failed: ${happyResult.error}`);
  await deleteOutboxItem(happyId);

  // ---------- Conflict path ----------
  await query(
    `UPDATE farmers
     SET status = 'pending_field_verification', updated_at = NOW()
     WHERE farmer_id = $1`,
    [target.farmer_id]
  );

  const conflictId = `proof-verify-conflict-${Date.now()}`;
  await enqueueOutbox({
    id: conflictId,
    actionType: 'farmer_verification',
    payload: {
      farmerId: target.farmer_id,
      farmerName: target.name,
      verificationStatus: 'verified',
      notes: 'proof should NOT apply — conflict',
      expected: { status: 'pending_field_verification' },
    },
  });

  // Someone else rejects while verification is queued
  await verifyFarmerField(target.farmer_id, 'rejected', 'Rejected by another agent during proof');

  const mid = await query<{ status: string }>(
    `SELECT status FROM farmers WHERE farmer_id = $1`,
    [target.farmer_id]
  );
  logStep(2, 'Meanwhile: another actor rejected the farmer (farmers.status)', {
    ok: mid[0]?.status === 'rejected',
    detail: JSON.stringify(mid[0] ?? null, null, 2),
  });
  if (mid[0]?.status !== 'rejected') fail('Expected farmers.status rejected before sync');

  const conflictResult = await processOutboxItem(conflictId);
  const conflictItem = await getOutboxItem(conflictId);
  const afterConflict = await query<{ status: string }>(
    `SELECT status FROM farmers WHERE farmer_id = $1`,
    [target.farmer_id]
  );

  const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
  const message = conflictItem?.lastError ?? conflictResult.error ?? '';

  logStep(3, 'Sync detects conflict → needs_review (does not overwrite)', {
    ok:
      conflictResult.ok === false &&
      conflictResult.needsReview === true &&
      conflictItem?.status === 'needs_review' &&
      afterConflict[0]?.status === 'rejected' &&
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
      },
      null,
      2
    ),
  });

  if (conflictItem?.status !== 'needs_review') {
    fail(`Expected needs_review, got ${conflictItem?.status}`);
  }
  if (afterConflict[0]?.status !== 'rejected') {
    fail('Blind verify overwrote the other actor’s rejection');
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

  // Restore farmer so demos stay usable
  await query(
    `UPDATE farmers
     SET status = 'pending_field_verification', updated_at = NOW()
     WHERE farmer_id = $1`,
    [target.farmer_id]
  );

  console.log('\n========================================');
  console.log('PROOF PASSED — farmer_verification conflict → needs_review');
  console.log('Pinned field: farmers.status');
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
