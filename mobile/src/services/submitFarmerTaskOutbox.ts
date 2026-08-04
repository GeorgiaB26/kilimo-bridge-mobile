import { extractApiError } from '../utils/feedback';
import {
  deleteOutboxItem,
  enqueueOutbox,
  listOutbox,
  type OutboxItem,
} from './offlineOutbox';
import { isLikelyConnectivityError } from './offlineOutboxHandlers';
import { processOutboxItem } from './offlineOutboxProcessor';

export type PendingTaskSubmissionView = {
  id: string;
  farmerTaskId: string;
  taskName: string;
  notes: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  photoLocalUri: string | null;
};

function outboxItemToPendingTask(item: OutboxItem): PendingTaskSubmissionView {
  const farmerTaskId =
    typeof item.payload.farmerTaskId === 'string' ? item.payload.farmerTaskId : '';
  const notes = typeof item.payload.notes === 'string' ? item.payload.notes : '';
  const taskName =
    typeof item.payload.taskName === 'string' ? item.payload.taskName : 'Task';
  return {
    id: item.id,
    farmerTaskId,
    taskName,
    notes,
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    photoLocalUri: item.photoLocalUri,
  };
}

export async function listPendingTaskSubmissions(): Promise<PendingTaskSubmissionView[]> {
  const items = await listOutbox({
    actionType: 'task_submission',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingTask);
}

/** Map of farmerTaskId → pending outbox row (newest wins if duplicates). */
export async function pendingTaskSubmissionByTaskId(): Promise<
  Map<string, PendingTaskSubmissionView>
> {
  const pending = await listPendingTaskSubmissions();
  const map = new Map<string, PendingTaskSubmissionView>();
  for (const row of pending) {
    if (!row.farmerTaskId) continue;
    if (!map.has(row.farmerTaskId)) map.set(row.farmerTaskId, row);
  }
  return map;
}

/**
 * Enqueue-first task evidence submit: persist locally, then try R2 + API.
 * Connectivity failures leave the row queued; other failures remove it and throw.
 */
export async function submitFarmerTaskWithOutbox(params: {
  farmerTaskId: string;
  taskName: string;
  notes: string;
  photoLocalUri: string;
  photoBase64?: string | null;
}): Promise<{ mode: 'online' } | { mode: 'offline'; pendingId: string }> {
  const photoLocalUri = params.photoLocalUri.trim();
  const photoBase64 = params.photoBase64?.trim() || null;
  if (!photoLocalUri && !photoBase64) {
    throw new Error('A photo is required before submitting this task');
  }

  const item = await enqueueOutbox({
    actionType: 'task_submission',
    payload: {
      farmerTaskId: params.farmerTaskId,
      notes: params.notes.trim(),
      taskName: params.taskName,
    },
    photoLocalUri: photoLocalUri || null,
    photoBase64,
  });

  const result = await processOutboxItem(item.id);

  if (result.ok) {
    return { mode: 'online' };
  }

  if (result.skipped) {
    throw new Error(result.error || 'Could not queue task submission');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not submit task'));
}

export async function pushPendingTaskSubmission(
  pendingId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await processOutboxItem(pendingId);
  if (result.ok) return { success: true };
  return { success: false, error: result.error || 'Sync failed' };
}

/** On task-list focus: try every queued task_submission (ignores backoff). */
export async function syncAllPendingTaskSubmissions(): Promise<{
  synced: number;
  failed: number;
}> {
  const items = await listOutbox({
    actionType: 'task_submission',
    includeSynced: false,
  });
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    const result = await processOutboxItem(item.id);
    if (result.ok) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
