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

export type PendingFarmerVerificationView = {
  id: string;
  farmerId: string;
  farmerName: string;
  verificationStatus: 'verified' | 'rejected';
  notes: string;
  expectedStatus: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingVerification(item: OutboxItem): PendingFarmerVerificationView {
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { status?: string })
      : {};
  return {
    id: item.id,
    farmerId: typeof item.payload.farmerId === 'string' ? item.payload.farmerId : '',
    farmerName: typeof item.payload.farmerName === 'string' ? item.payload.farmerName : 'Farmer',
    verificationStatus: item.payload.verificationStatus === 'rejected' ? 'rejected' : 'verified',
    notes: typeof item.payload.notes === 'string' ? item.payload.notes : '',
    expectedStatus: typeof expected.status === 'string' ? expected.status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingFarmerVerifications(): Promise<PendingFarmerVerificationView[]> {
  const items = await listOutbox({
    actionType: 'farmer_verification',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingVerification);
}

export async function dismissFarmerVerificationOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first field verification with expected farmers.status pin.
 * Authoritative field: farmers.status (typically pending_field_verification).
 */
export async function submitFarmerVerificationWithOutbox(params: {
  farmerId: string;
  farmerName: string;
  verificationStatus: 'verified' | 'rejected';
  /** farmers.status the agent saw when deciding. */
  expectedStatus: string;
  notes?: string;
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedStatus = params.expectedStatus.trim();
  if (!expectedStatus) {
    throw new Error('expectedStatus is required for offline farmer verification');
  }

  const item = await enqueueOutbox({
    actionType: 'farmer_verification',
    payload: {
      farmerId: params.farmerId,
      farmerName: params.farmerName,
      verificationStatus: params.verificationStatus,
      notes: params.notes?.trim() ?? '',
      expected: { status: expectedStatus },
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
    throw new Error(result.error || 'Could not queue farmer verification');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not verify farmer'));
}

export async function pushPendingFarmerVerification(
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

export async function syncAllPendingFarmerVerifications(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'farmer_verification',
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
