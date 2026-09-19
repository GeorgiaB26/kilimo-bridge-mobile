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

export type PendingAgentTaskCreateView = {
  kind: 'create';
  id: string;
  name: string;
  dueDate: string;
  priority: string;
  assignedFarmerCount: number;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
  statusLabel: string;
};

export type PendingAgentTaskStatusUpdateView = {
  kind: 'status_update';
  id: string;
  agentTaskId: string;
  taskName: string;
  status: string;
  expectedStatus: string;
  createdAt: string;
  syncError?: string;
  outboxStatus: OutboxItem['status'];
  statusLabel: string;
};

export type PendingAgentPersonalTaskView =
  | PendingAgentTaskCreateView
  | PendingAgentTaskStatusUpdateView;

function outboxItemToPendingCreate(item: OutboxItem): PendingAgentTaskCreateView {
  const assigned = Array.isArray(item.payload.assigned_farmers)
    ? item.payload.assigned_farmers.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    kind: 'create',
    id: item.id,
    name: typeof item.payload.name === 'string' ? item.payload.name : 'Task',
    dueDate: typeof item.payload.due_date === 'string' ? item.payload.due_date : '',
    priority: typeof item.payload.priority === 'string' ? item.payload.priority : 'medium',
    assignedFarmerCount: assigned.length,
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

function outboxItemToPendingStatusUpdate(item: OutboxItem): PendingAgentTaskStatusUpdateView {
  const expected =
    item.payload.expected && typeof item.payload.expected === 'object'
      ? (item.payload.expected as { status?: string })
      : {};
  return {
    kind: 'status_update',
    id: item.id,
    agentTaskId: typeof item.payload.agentTaskId === 'string' ? item.payload.agentTaskId : '',
    taskName: typeof item.payload.taskName === 'string' ? item.payload.taskName : 'Task',
    status: typeof item.payload.status === 'string' ? item.payload.status : '',
    expectedStatus: typeof expected.status === 'string' ? expected.status : '',
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    outboxStatus: item.status,
    statusLabel: outboxStatusUserLabel(item.status),
  };
}

export async function listPendingAgentTaskCreates(): Promise<PendingAgentTaskCreateView[]> {
  const items = await listOutbox({
    actionType: 'agent_task_create',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingCreate);
}

export async function listPendingAgentTaskStatusUpdates(): Promise<PendingAgentTaskStatusUpdateView[]> {
  const items = await listOutbox({
    actionType: 'agent_task_status_update',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingStatusUpdate);
}

export async function listPendingAgentPersonalTasks(): Promise<PendingAgentPersonalTaskView[]> {
  const [creates, updates] = await Promise.all([
    listPendingAgentTaskCreates(),
    listPendingAgentTaskStatusUpdates(),
  ]);
  return [...creates, ...updates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function dismissAgentPersonalTaskOutbox(pendingId: string): Promise<void> {
  await deleteOutboxItem(pendingId);
}

export async function createAgentPersonalTaskWithOutbox(params: {
  name: string;
  description?: string;
  due_date: string;
  priority: string;
  assigned_farmers?: string[];
}): Promise<
  | { mode: 'online'; task?: Record<string, unknown> }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const name = params.name.trim();
  const dueDate = params.due_date.trim();
  if (!name) throw new Error('Task name is required');
  if (!dueDate) throw new Error('Due date is required');

  const item = await enqueueOutbox({
    actionType: 'agent_task_create',
    payload: {
      name,
      description: params.description?.trim() || undefined,
      due_date: dueDate,
      priority: params.priority || 'medium',
      assigned_farmers: params.assigned_farmers ?? [],
    },
  });

  const result = await processOutboxItem(item.id);

  if (result.ok) {
    const task =
      result.data && typeof result.data === 'object' && 'task' in (result.data as object)
        ? ((result.data as { task?: Record<string, unknown> }).task ?? undefined)
        : undefined;
    return { mode: 'online', task };
  }

  if (result.needsReview) {
    return {
      mode: 'needs_review',
      pendingId: item.id,
      error: result.error || 'Needs your review',
    };
  }

  if (result.skipped) {
    throw new Error(result.error || 'Could not queue task creation');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not create task'));
}

export async function updateAgentPersonalTaskStatusWithOutbox(params: {
  agentTaskId: string;
  taskName: string;
  status: string;
  expectedStatus: string;
}): Promise<
  | { mode: 'online'; task?: Record<string, unknown> }
  | { mode: 'offline'; pendingId: string }
  | { mode: 'needs_review'; pendingId: string; error: string }
> {
  const expectedStatus = params.expectedStatus.trim();
  const status = params.status.trim();
  if (!expectedStatus) {
    throw new Error('expectedStatus is required for offline agent task status updates');
  }
  if (!status) throw new Error('status is required');

  const item = await enqueueOutbox({
    actionType: 'agent_task_status_update',
    payload: {
      agentTaskId: params.agentTaskId,
      taskName: params.taskName,
      status,
      expected: { status: expectedStatus },
    },
  });

  const result = await processOutboxItem(item.id);

  if (result.ok) {
    const task =
      result.data && typeof result.data === 'object' && 'task' in (result.data as object)
        ? ((result.data as { task?: Record<string, unknown> }).task ?? undefined)
        : undefined;
    return { mode: 'online', task };
  }

  if (result.needsReview) {
    return {
      mode: 'needs_review',
      pendingId: item.id,
      error: result.error || 'Needs your review',
    };
  }

  if (result.skipped) {
    throw new Error(result.error || 'Could not queue task status update');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Could not update task status'));
}

export async function pushPendingAgentPersonalTask(
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

export async function syncAllPendingAgentPersonalTasks(): Promise<{
  synced: number;
  failed: number;
  needsReview: number;
}> {
  const [creates, updates] = await Promise.all([
    listOutbox({ actionType: 'agent_task_create', includeSynced: false }),
    listOutbox({ actionType: 'agent_task_status_update', includeSynced: false }),
  ]);
  const relevant = [...creates, ...updates];
  let synced = 0;
  let failed = 0;
  let needsReview = 0;
  for (const item of relevant) {
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
