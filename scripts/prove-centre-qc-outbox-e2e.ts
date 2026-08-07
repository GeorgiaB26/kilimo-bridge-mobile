/**
 * Proof: centre_qc outbox + conflict → needs_review.
 *
 * Pins centre_inventory.quality_status === 'pending'.
 * Decision maps to API approved|rejected (DB stores passed|failed).
 *
 * Usage (backend on :3001):
 *   NODE_PATH=./backend/node_modules node ./scripts/build-prove-centre-qc-outbox.cjs
 *   NODE_PATH=./backend/node_modules:./mobile/node_modules node ./scripts/_prove-centre-qc-outbox.bundle.cjs
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
  console.log('Offline centre_qc outbox — conflict / needs_review proof');
  console.log(`API: ${process.env.EXPO_PUBLIC_API_URL}`);
  console.log('Authoritative pin field: centre_inventory.quality_status (pending)');

  const {
    setAuthToken,
    devQuickLogin,
    approveInventoryQuality,
    getCentreInventoryItem,
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

  const prior = await listOutbox({ actionType: 'centre_qc', includeSynced: true });
  for (const item of prior) {
    await deleteOutboxItem(item.id);
  }

  // Find or seed a pending inventory row
  let rows = await query<{
    id: string;
    product_name: string;
    quality_status: string;
    centre_id: string;
  }>(
    `SELECT id, product_name, quality_status, centre_id
     FROM centre_inventory
     WHERE quality_status = 'pending'
     ORDER BY received_date DESC
     LIMIT 1`
  );

  if (!rows[0]) {
    const centre = await query<{ centre_id: string }>(
      `SELECT centre_id FROM aggregation_centres LIMIT 1`
    );
    const farmer = await query<{ farmer_id: string }>(
      `SELECT farmer_id FROM farmers LIMIT 1`
    );
    if (!centre[0] || !farmer[0]) fail('Need a centre and farmer to seed QC inventory');
    const seeded = await query<{ id: string }>(
      `INSERT INTO centre_inventory (
         id, centre_id, farmer_id, product_name, quantity_received, unit, quality_status
       ) VALUES (
         gen_random_uuid(), $1, $2, 'Proof QC Coffee', 25, 'kg', 'pending'
       )
       RETURNING id`,
      [centre[0].centre_id, farmer[0].farmer_id]
    );
    rows = [
      {
        id: seeded[0].id,
        product_name: 'Proof QC Coffee',
        quality_status: 'pending',
        centre_id: centre[0].centre_id,
      },
    ];
    console.log(`Seeded pending inventory ${seeded[0].id}`);
  }

  const target = rows[0];
  console.log(
    `Target inventory=${target.id} product="${target.product_name}" quality_status=${target.quality_status}`
  );

  // Confirm GET-by-id works for conflict check
  const liveGet = await getCentreInventoryItem(target.id);
  logStep(0, 'GET delivery by id (conflict-check endpoint)', {
    ok: liveGet?.delivery?.id === target.id && liveGet?.delivery?.quality_status === 'pending',
    detail: JSON.stringify(
      {
        id: liveGet?.delivery?.id,
        quality_status: liveGet?.delivery?.quality_status,
        product_name: liveGet?.delivery?.product_name,
      },
      null,
      2
    ),
  });
  if (liveGet?.delivery?.quality_status !== 'pending') {
    fail('Expected pending quality_status from GET');
  }

  // ---------- Happy path ----------
  const happyId = `proof-qc-ok-${Date.now()}`;
  await enqueueOutbox({
    id: happyId,
    actionType: 'centre_qc',
    payload: {
      inventoryId: target.id,
      productName: target.product_name,
      decision: 'approve',
      qualityNotes: 'proof happy-path QC approval',
      marketplacePricePerUnit: 120,
      expected: { quality_status: 'pending' },
    },
  });

  const happyResult = await processOutboxItem(happyId);
  const happyItem = await getOutboxItem(happyId);
  const afterHappy = await query<{ quality_status: string }>(
    `SELECT quality_status FROM centre_inventory WHERE id = $1`,
    [target.id]
  );
  logStep(1, 'Happy path: approve applies when quality_status still pending', {
    ok:
      happyResult.ok === true &&
      happyItem?.status === 'synced' &&
      afterHappy[0]?.quality_status === 'passed',
    detail: JSON.stringify(
      {
        processOk: happyResult.ok,
        outboxStatus: happyItem?.status,
        dbQualityStatus: afterHappy[0]?.quality_status,
      },
      null,
      2
    ),
  });
  if (!happyResult.ok) fail(`Happy path QC approve failed: ${happyResult.error}`);
  await deleteOutboxItem(happyId);

  // ---------- Conflict path ----------
  await query(
    `UPDATE centre_inventory
     SET quality_status = 'pending',
         is_marketplace_ready = false,
         marketplace_price_per_unit = NULL,
         quality_notes = NULL
     WHERE id = $1`,
    [target.id]
  );

  const conflictId = `proof-qc-conflict-${Date.now()}`;
  await enqueueOutbox({
    id: conflictId,
    actionType: 'centre_qc',
    payload: {
      inventoryId: target.id,
      productName: target.product_name,
      decision: 'approve',
      qualityNotes: 'proof should NOT apply — conflict',
      marketplacePricePerUnit: 99,
      expected: { quality_status: 'pending' },
    },
  });

  // Someone else rejects while approval is queued
  await approveInventoryQuality(target.id, {
    quality_status: 'rejected',
    quality_notes: 'Rejected by another staff during proof',
  });

  const mid = await query<{ quality_status: string }>(
    `SELECT quality_status FROM centre_inventory WHERE id = $1`,
    [target.id]
  );
  logStep(2, 'Meanwhile: another actor rejected QC (quality_status=failed)', {
    ok: mid[0]?.quality_status === 'failed',
    detail: JSON.stringify(mid[0] ?? null, null, 2),
  });
  if (mid[0]?.quality_status !== 'failed') fail('Expected quality_status failed before sync');

  const conflictResult = await processOutboxItem(conflictId);
  const conflictItem = await getOutboxItem(conflictId);
  const afterConflict = await query<{ quality_status: string; quality_notes: string | null }>(
    `SELECT quality_status, quality_notes FROM centre_inventory WHERE id = $1`,
    [target.id]
  );

  const uiLabel = conflictItem ? outboxStatusUserLabel(conflictItem.status) : '';
  const message = conflictItem?.lastError ?? conflictResult.error ?? '';

  logStep(3, 'Sync detects conflict → needs_review (does not overwrite)', {
    ok:
      conflictResult.ok === false &&
      conflictResult.needsReview === true &&
      conflictItem?.status === 'needs_review' &&
      afterConflict[0]?.quality_status === 'failed' &&
      !String(afterConflict[0]?.quality_notes ?? '').includes('proof should NOT apply') &&
      uiLabel === 'Needs your review' &&
      message.toLowerCase().includes('changed since') &&
      message.toLowerCase().includes('quality_status'),
    detail: JSON.stringify(
      {
        processOk: conflictResult.ok,
        needsReview: conflictResult.needsReview,
        outboxStatus: conflictItem?.status,
        uiLabel,
        lastError: message,
        dbQualityStatus: afterConflict[0]?.quality_status,
        dbNotes: afterConflict[0]?.quality_notes,
      },
      null,
      2
    ),
  });

  if (conflictItem?.status !== 'needs_review') {
    fail(`Expected needs_review, got ${conflictItem?.status}`);
  }
  if (afterConflict[0]?.quality_status !== 'failed') {
    fail('Blind approve overwrote the other actor’s rejection');
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

  // Restore pending so demos stay usable
  await query(
    `UPDATE centre_inventory
     SET quality_status = 'pending',
         is_marketplace_ready = false,
         marketplace_price_per_unit = NULL,
         quality_notes = NULL
     WHERE id = $1`,
    [target.id]
  );

  console.log('\n========================================');
  console.log('PROOF PASSED — centre_qc conflict → needs_review');
  console.log('Pinned field: centre_inventory.quality_status');
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
