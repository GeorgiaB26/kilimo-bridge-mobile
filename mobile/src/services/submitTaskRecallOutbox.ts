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

export type PendingTaskRecallView = {
  id: string;
  taskId: string;
  taskName: string;
  source: 'hierarchy' | 'agent_assignment';
  expectedStatus: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingRecall(item: OutboxItem): PendingTaskRecallView {
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { status?: string })
      : {};
  const sourceRaw = item.payload.source;
  const source =
    sourceRaw === 'agent_assignment' || sourceRaw === 'hierarchy'
      ? sourceRaw
      : 'hierarchy';
  return {
    id: item.id,
    taskId: typeof item.payload.taskId === 'string' ? item.payload.taskId : '',
    taskName: typeof item.payload.taskName === 'string' ? item.payload.taskName : 'Task',
    source,
    expectedStatus: typeof expected.status === 'string' ? expected.status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingTaskRecalls(): Promise<PendingTaskRecallView[]> {
  const items = await listOutbox({
    actionType: 'task_recall',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingRecall);
}

/** Map of taskId → pending recall (newest wins). */
export async function pendingTaskRecallByTaskId(): Promise<
  Map<string, PendingTaskRecallView>
> {
  const pending = await listPendingTaskRecalls();
  const map = new Map<string, PendingTaskRecallView>();
  for (const row of pending) {
    if (!row.taskId) continue;
    if (!map.has(row.taskId)) map.set(row.taskId, row);
  }
  return map;
}

export async function dismissTaskRecallOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first task recall with expected status pin (submitted-for-approval).
 * Connectivity failures leave the row queued; conflicts stay as needs_review;
 * other failures remove the row and throw.
 */
export async function recallFarmerTaskWithOutbox(params: {
  taskId: string;
  taskName: string;
  source: 'hierarchy' | 'agent_assignment';
  /** Status the farmer saw when recalling (usually submitted-for-approval). */
  expectedStatus: string;
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedStatus = params.expectedStatus.trim();
  if (!expectedStatus) {
    throw new Error('expectedStatus is required for offline task recall');
  }

  const item = await enqueueOutbox({
    actionType: 'task_recall',
    payload: {
      taskId: params.taskId,
      taskName: params.taskName,
      source: params.source,
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
    throw new Error(result.error || 'Could not queue task recall');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not recall task'));
}

export async function pushPendingTaskRecall(
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

/** On farmer tasks focus: try every queued task_recall that is still auto-syncable. */
export async function syncAllPendingTaskRecalls(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'task_recall',
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
