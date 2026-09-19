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

export type PendingTaskStartView = {
  id: string;
  taskId: string;
  taskName: string;
  source: 'hierarchy' | 'agent_assignment';
  startDate: string;
  expectedStatus: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingStart(item: OutboxItem): PendingTaskStartView {
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
    startDate: typeof item.payload.startDate === 'string' ? item.payload.startDate : '',
    expectedStatus: typeof expected.status === 'string' ? expected.status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingTaskStarts(): Promise<PendingTaskStartView[]> {
  const items = await listOutbox({
    actionType: 'task_start',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingStart);
}

/** Map of taskId → pending start (newest wins). */
export async function pendingTaskStartByTaskId(): Promise<
  Map<string, PendingTaskStartView>
> {
  const pending = await listPendingTaskStarts();
  const map = new Map<string, PendingTaskStartView>();
  for (const row of pending) {
    if (!row.taskId) continue;
    if (!map.has(row.taskId)) map.set(row.taskId, row);
  }
  return map;
}

export async function dismissTaskStartOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first task start with expected status pin (not-started).
 * Connectivity failures leave the row queued; conflicts stay as needs_review;
 * other failures remove the row and throw.
 */
export async function startFarmerTaskWithOutbox(params: {
  taskId: string;
  taskName: string;
  source: 'hierarchy' | 'agent_assignment';
  startDate: string;
  /** Status the farmer saw when starting (usually not-started). */
  expectedStatus: string;
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedStatus = params.expectedStatus.trim();
  const startDate = params.startDate.trim();
  if (!expectedStatus) {
    throw new Error('expectedStatus is required for offline task start');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Start date must be YYYY-MM-DD');
  }

  const item = await enqueueOutbox({
    actionType: 'task_start',
    payload: {
      taskId: params.taskId,
      taskName: params.taskName,
      source: params.source,
      startDate,
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
    throw new Error(result.error || 'Could not queue task start');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not start task'));
}

export async function pushPendingTaskStart(
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

/** On farmer tasks focus: try every queued task_start that is still auto-syncable. */
export async function syncAllPendingTaskStarts(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'task_start',
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
