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

export type PendingAgentTaskApprovalView = {
  id: string;
  agentTaskId: string;
  taskName: string;
  decision: 'approve' | 'reject';
  notes: string;
  rejectionReason: string;
  expectedStatus: string;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

function outboxItemToPendingApproval(item: OutboxItem): PendingAgentTaskApprovalView {
  const agentTaskId =
    typeof item.payload.agentTaskId === 'string' ? item.payload.agentTaskId : '';
  const decision = item.payload.decision === 'reject' ? 'reject' : 'approve';
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { status?: string })
      : {};
  return {
    id: item.id,
    agentTaskId,
    taskName: typeof item.payload.taskName === 'string' ? item.payload.taskName : 'Task',
    decision,
    notes: typeof item.payload.notes === 'string' ? item.payload.notes : '',
    rejectionReason:
      typeof item.payload.rejectionReason === 'string' ? item.payload.rejectionReason : '',
    expectedStatus: typeof expected.status === 'string' ? expected.status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingAgentTaskApprovals(): Promise<PendingAgentTaskApprovalView[]> {
  const items = await listOutbox({
    actionType: 'agent_task_approval',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingApproval);
}

export async function dismissAgentTaskApprovalOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

/**
 * Enqueue-first agent_tasks approve/reject with expected status pin.
 * Connectivity failures leave the row queued; conflicts stay as needs_review;
 * other failures remove the row and throw.
 */
export async function submitAgentTaskDecisionWithOutbox(params: {
  agentTaskId: string;
  taskName: string;
  decision: 'approve' | 'reject';
  /** Status the agent saw when deciding (usually submitted-for-approval). */
  expectedStatus: string;
  notes?: string;
  rejectionReason?: string;
}): Promise<
  | { mode: 'online' }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedStatus = params.expectedStatus.trim();
  if (!expectedStatus) {
    throw new Error('expectedStatus is required for offline agent task decisions');
  }
  if (params.decision === 'reject' && !params.rejectionReason?.trim()) {
    throw new Error('Rejection reason is required');
  }

  const item = await enqueueOutbox({
    actionType: 'agent_task_approval',
    payload: {
      agentTaskId: params.agentTaskId,
      taskName: params.taskName,
      decision: params.decision,
      notes: params.notes?.trim() ?? '',
      rejectionReason: params.rejectionReason?.trim() ?? '',
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
    throw new Error(result.error || 'Could not queue agent task decision');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not apply agent task decision'));
}

export async function pushPendingAgentTaskApproval(
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

/** On agent tasks focus: try every queued agent_task_approval that is still auto-syncable. */
export async function syncAllPendingAgentTaskApprovals(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const items = await listOutbox({
    actionType: 'agent_task_approval',
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
