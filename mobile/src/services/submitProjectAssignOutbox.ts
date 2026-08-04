import { extractApiError } from '../utils/feedback';
import {
  deleteOutboxItem,
  enqueueOutbox,
  listOutbox,
  type OutboxItem,
} from './offlineOutbox';
import { isLikelyConnectivityError, sortedFarmerIds } from './offlineOutboxHandlers';
import { outboxStatusUserLabel } from './offlineOutboxExpected';
import { processOutboxItem } from './offlineOutboxProcessor';

export type PendingProjectAssignView = {
  id: string;
  projectId: string;
  projectName: string;
  farmerIds: string[];
  expectedFarmerIds: string[];
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingAssign(item: OutboxItem): PendingProjectAssignView {
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { farmerIds?: unknown })
      : {};
  const farmerIds = Array.isArray(item.payload.farmerIds)
    ? sortedFarmerIds(item.payload.farmerIds.filter((id): id is string => typeof id === 'string'))
    : [];
  const expectedFarmerIds = Array.isArray(expected.farmerIds)
    ? sortedFarmerIds(expected.farmerIds.filter((id): id is string => typeof id === 'string'))
    : [];
  return {
    id: item.id,
    projectId: typeof item.payload.projectId === 'string' ? item.payload.projectId : '',
    projectName: typeof item.payload.projectName === 'string' ? item.payload.projectName : 'Project',
    farmerIds,
    expectedFarmerIds,
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingProjectAssigns(): Promise<PendingProjectAssignView[]> {
  const items = await listOutbox({
    actionType: 'project_assign',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingAssign);
}

export async function dismissProjectAssignOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first project farmer assignment.
 * Pins the sorted enrolled farmer_id set at enqueue time.
 */
export async function submitProjectAssignWithOutbox(params: {
  projectId: string;
  projectName: string;
  farmerIds: string[];
  /** Enrolled farmer ids when the admin decided (may be empty). */
  expectedFarmerIds: string[];
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const farmerIds = sortedFarmerIds(params.farmerIds);
  if (farmerIds.length === 0) {
    throw new Error('farmerIds is required for project assignment');
  }
  if (!Array.isArray(params.expectedFarmerIds)) {
    throw new Error('expectedFarmerIds is required for offline project assignment');
  }

  const item = await enqueueOutbox({
    actionType: 'project_assign',
    payload: {
      projectId: params.projectId,
      projectName: params.projectName,
      farmerIds,
      expected: { farmerIds: sortedFarmerIds(params.expectedFarmerIds) },
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
    throw new Error(result.error || 'Could not queue farmer assignment');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not assign farmers'));
}

export async function pushPendingProjectAssign(
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

export async function syncAllPendingProjectAssigns(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'project_assign',
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
