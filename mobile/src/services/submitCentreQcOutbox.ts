import { extractApiError } from '../utils/feedback';
import {
  deleteOutboxItem,
  enqueueOutbox,
  listOutbox,
  type OutboxItem,
} from './offlineOutbox';
import { isLikelyConnectivityError } from './offlineOutboxHandlers';
import { outboxStatusUserLabel } from './offlineOutboxExpected';
import { processOutboxItem } from './offlineOutboxProcessor';

/** Authoritative expected pin for centre QC — matches DB / list API. */
export const CENTRE_QC_EXPECTED_QUALITY_STATUS = 'pending';

export type PendingCentreQcView = {
  id: string;
  inventoryId: string;
  productName: string;
  decision: 'approve' | 'reject';
  qualityNotes: string;
  marketplacePricePerUnit: number | null;
  expectedQualityStatus: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingQc(item: OutboxItem): PendingCentreQcView {
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { quality_status?: string })
      : {};
  const price = item.payload.marketplacePricePerUnit;
  return {
    id: item.id,
    inventoryId: typeof item.payload.inventoryId === 'string' ? item.payload.inventoryId : '',
    productName: typeof item.payload.productName === 'string' ? item.payload.productName : 'Delivery',
    decision: item.payload.decision === 'reject' ? 'reject' : 'approve',
    qualityNotes: typeof item.payload.qualityNotes === 'string' ? item.payload.qualityNotes : '',
    marketplacePricePerUnit: typeof price === 'number' ? price : null,
    expectedQualityStatus:
      typeof expected.quality_status === 'string' ? expected.quality_status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingCentreQc(): Promise<PendingCentreQcView[]> {
  const items = await listOutbox({
    actionType: 'centre_qc',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingQc);
}

export async function dismissCentreQcOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first centre QC with quality_status === 'pending' pin.
 */
export async function submitCentreQcWithOutbox(params: {
  inventoryId: string;
  productName: string;
  decision: 'approve' | 'reject';
  /** Must be the live row’s quality_status (normally pending). */
  expectedQualityStatus: string;
  qualityNotes?: string;
  marketplacePricePerUnit?: number;
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedQualityStatus = params.expectedQualityStatus.trim();
  if (!expectedQualityStatus) {
    throw new Error('expectedQualityStatus is required for offline centre QC');
  }

  const item = await enqueueOutbox({
    actionType: 'centre_qc',
    payload: {
      inventoryId: params.inventoryId,
      productName: params.productName,
      decision: params.decision,
      qualityNotes: params.qualityNotes?.trim() ?? '',
      marketplacePricePerUnit:
        params.marketplacePricePerUnit != null && Number.isFinite(params.marketplacePricePerUnit)
          ? params.marketplacePricePerUnit
          : null,
      expected: { quality_status: expectedQualityStatus },
    },
  });

  const result = await processOutboxItem(item.id);

  if (result.ok) {
    return { mode: 'online' };
  }

  if (result.needsReview) {
    return {
      mode: 'needs_review',
      pendingId: item.id,
      error: result.error || 'Needs your review',
    };
  }

  if (result.skipped) {
    throw new Error(result.error || 'Could not queue centre QC');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not apply quality check'));
}

export async function pushPendingCentreQc(
  pendingId: string
): Promise<{ success: boolean; error?: string; needsReview?: boolean }> {
  const result = await processOutboxItem(pendingId);
  if (result.ok) return { success: true };
  return {
    success: false,
    error: result.error || 'Sync failed',
    needsReview: result.needsReview,
  };
}

export async function syncAllPendingCentreQc(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'centre_qc',
    includeSynced: false,
  });
  let synced = 0;
  let failed = 0;
  let needsReview = 0;
  for (const item of items) {
    if (item.status === 'needs_review') {
      needsReview += 1;
      continue;
    }
    const result = await processOutboxItem(item.id);
    if (result.ok) synced += 1;
    else if (result.needsReview) needsReview += 1;
    else failed += 1;
  }
  return { synced, failed, needsReview };
}
