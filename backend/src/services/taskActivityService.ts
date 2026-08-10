import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { createNotification } from './notificationService';

export async function ensureTaskActivityLogTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS task_activity_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      farmer_id TEXT,
      field_agent_user_id TEXT,
      status_before TEXT,
      status_after TEXT NOT NULL,
      action TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_task_activity_farmer ON task_activity_log(farmer_id)');
}

export async function logTaskActivity(input: {
  taskId: string;
  farmerId?: string | null;
  fieldAgentUserId?: string | null;
  statusBefore?: string | null;
  statusAfter: string;
  action: string;
  notes?: string | null;
}): Promise<void> {
  await query(
    `
    INSERT INTO task_activity_log (
      id, task_id, farmer_id, field_agent_user_id, status_before, status_after, action, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      uuidv4(),
      input.taskId,
      input.farmerId ?? null,
      input.fieldAgentUserId ?? null,
      input.statusBefore ?? null,
      input.statusAfter,
      input.action,
      input.notes ?? null,
    ]
  );
}

function normalizeStatus(status: string): string {
  return status.replace(/_/g, '-').toLowerCase();
}

function statusChangeLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function farmerStatusChangeCopy(
  agentName: string,
  taskName: string,
  oldStatus: string,
  newStatus: string
): { title: string; message: string; type: string } {
  const next = normalizeStatus(newStatus);
  if (next === 'in-progress') {
    return {
      title: 'Task Updated - In Progress',
      message: `${agentName} marked "${taskName}" as in progress`,
      type: 'info',
    };
  }
  if (next === 'completed') {
    return {
      title: 'Task Completed!',
      message: `Your task "${taskName}" has been marked complete by ${agentName}`,
      type: 'success',
    };
  }
  if (next === 'not-started') {
    return {
      title: 'Task Needs Attention',
      message: `${taskName} status changed to not started`,
      type: 'warning',
    };
  }
  const change = `${statusChangeLabel(oldStatus)} → ${statusChangeLabel(newStatus)}`;
  return {
    title: 'Task Updated',
    message: `${taskName}: ${change}`,
    type: 'info',
  };
}

/** Notify assigned farmers when a field agent changes agent_tasks status. */
export async function notifyFarmersOnAgentTaskStatusChange(input: {
  taskId: string;
  taskName: string;
  agentUserId: string;
  assignedFarmerIds: string[];
  statusBefore: string;
  statusAfter: string;
}): Promise<void> {
  if (input.statusBefore === input.statusAfter) return;
  if (!input.assignedFarmerIds.length) return;

  const agent = await queryOne<{ name: string | null }>(
    'SELECT name FROM users WHERE user_id = $1',
    [input.agentUserId]
  );
  const agentName = agent?.name?.trim() || 'Your field agent';
  const copy = farmerStatusChangeCopy(
    agentName,
    input.taskName,
    input.statusBefore,
    input.statusAfter
  );

  for (const farmerId of input.assignedFarmerIds) {
    const farmerUser = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE farmer_id = $1 LIMIT 1',
      [farmerId]
    );
    if (!farmerUser?.user_id) continue;

    await createNotification({
      userId: farmerUser.user_id,
      title: copy.title,
      message: copy.message,
      type: copy.type,
      contextType: 'agent_task',
      contextId: input.taskId,
      actionUrl: `/tasks/${input.taskId}`,
      priority: copy.type === 'success' ? 'high' : 'normal',
    });
  }

  await logTaskActivity({
    taskId: input.taskId,
    fieldAgentUserId: input.agentUserId,
    statusBefore: input.statusBefore,
    statusAfter: input.statusAfter,
    action: 'status_changed',
  });
}

/** Notify field agent when a farmer starts an assigned agent task. */
export async function notifyAgentOnFarmerTaskStarted(input: {
  taskId: string;
  taskName: string;
  farmerId: string;
  agentUserId: string;
  statusBefore: string;
  statusAfter: string;
}): Promise<void> {
  const farmer = await queryOne<{ name: string | null }>(
    'SELECT name FROM farmers WHERE farmer_id = $1',
    [input.farmerId]
  );
  const farmerName = farmer?.name?.trim() || 'A farmer';

  await createNotification({
    userId: input.agentUserId,
    title: 'Farmer Started Task',
    message: `${farmerName} has started: ${input.taskName}`,
    type: 'success',
    contextType: 'agent_task',
    contextId: input.taskId,
    actionUrl: `/tasks/${input.taskId}`,
    priority: 'high',
  });

  await logTaskActivity({
    taskId: input.taskId,
    farmerId: input.farmerId,
    fieldAgentUserId: input.agentUserId,
    statusBefore: input.statusBefore,
    statusAfter: input.statusAfter,
    action: 'started',
  });
}
