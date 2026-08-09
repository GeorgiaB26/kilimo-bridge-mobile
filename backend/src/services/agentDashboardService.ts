import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { getFarmersInRegion } from './agentService';
import { fromDbTaskStatus } from './hierarchyService';
import { resolvePhotoUrlForDisplay } from './r2StorageService';
import { createNotification } from './notificationService';
import { countTaskCategories, compareDueDates } from '../utils/taskCategorization';

export interface AgentPersonalTask {
  id: string;
  agent_user_id: string;
  name: string;
  description?: string | null;
  due_date: string;
  priority: string;
  status: string;
  assigned_farmer_ids?: string | null;
  assigned_farmer_names?: string[];
  reminder_type?: string | null;
  photo_evidence_url?: string | null;
  notes?: string | null;
  submitted_at?: string | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  farmer_started_at?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: 'personal';
}

/** Full lifecycle for agent-assigned farmer work (stored with underscores). */
export const AGENT_TASK_WORKFLOW_STATUSES = new Set([
  'not_started',
  'in_progress',
  'submitted_for_approval',
  'approved',
  'rejected',
  // Legacy agent-only personal todos (no farmer assignment)
  'completed',
]);

/** Statuses an agent may set via the generic PATCH (not farmer submit / review). */
const AGENT_TASK_AGENT_EDITABLE_STATUSES = new Set([
  'not_started',
  'in_progress',
  'completed',
]);

/** @deprecated Use AGENT_TASK_WORKFLOW_STATUSES */
const AGENT_TASK_STATUSES = AGENT_TASK_WORKFLOW_STATUSES;

export function parseAssignedFarmerIds(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeAgentTaskStatus(status: string): string {
  return status.trim().replace(/-/g, '_');
}

export function agentTaskStatusToApi(status: string): string {
  const s = normalizeAgentTaskStatus(status);
  // Match farmer hierarchy display: hyphens + submitted-for-approval naming
  if (s === 'submitted_for_approval') return 'submitted-for-approval';
  return s.replace(/_/g, '-');
}

async function enrichPersonalTask(row: AgentPersonalTask): Promise<AgentPersonalTask> {
  const ids = parseAssignedFarmerIds(row.assigned_farmer_ids);
  const photo_evidence_url = await resolvePhotoUrlForDisplay(row.photo_evidence_url ?? null);
  if (!ids.length) {
    return {
      ...row,
      photo_evidence_url,
      assigned_farmer_names: [],
      source: 'personal',
      status: agentTaskStatusToApi(row.status),
    };
  }
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const farmers = await query<{ farmer_id: string; name: string }>(
    `SELECT farmer_id, name FROM farmers WHERE farmer_id IN (${placeholders})`,
    ids
  );
  const nameById = new Map(farmers.map((f) => [f.farmer_id, f.name]));
  return {
    ...row,
    photo_evidence_url,
    assigned_farmer_names: ids.map((id) => nameById.get(id) ?? id),
    source: 'personal',
    status: agentTaskStatusToApi(row.status),
  };
}

export interface RegionFarmerTaskRow {
  id: string;
  farmer_id: string;
  status: string;
  name: string;
  due_date?: string | null;
  farmer_name?: string;
  program_project_name?: string;
  submitted_date?: string | null;
  completed_date?: string | null;
  payment_value_kes?: number;
  notes?: string | null;
  photo_evidence_url?: string | null;
  rejection_reason?: string | null;
  description?: string | null;
  source?: 'farmer';
}

function farmerDistrictClause(district?: string, region?: string, alias = 'f'): string {
  if (district) {
    return `${alias}.district = $1`;
  }
  return `${alias}.district IN (SELECT DISTINCT district FROM agents WHERE region = $1)`;
}

function farmerDistrictParams(district?: string, region?: string): unknown[] {
  return district ? [district] : [region ?? ''];
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function classifyTaskDue(dueDate?: string | null, now = new Date()): {
  upcoming: boolean;
  overdue: boolean;
  daysOverdue: number;
} {
  const due = parseDate(dueDate);
  if (!due) return { upcoming: false, overdue: false, daysOverdue: 0 };
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diff = daysBetween(today, dueDay);
  if (diff < 0) {
    return { upcoming: false, overdue: true, daysOverdue: -diff };
  }
  if (diff <= 7) {
    return { upcoming: true, overdue: false, daysOverdue: 0 };
  }
  return { upcoming: false, overdue: false, daysOverdue: 0 };
}

export async function ensureAgentTasksTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agent_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'not_started',
      assigned_farmer_ids TEXT,
      reminder_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Farmer evidence + agent review (parity with farmer_tasks submit/approve flow)
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS photo_evidence_url TEXT`);
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS notes TEXT`);
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS farmer_started_at DATE`);
  await query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks(due_date)');
  await query(
    `CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status)`
  );
}

export async function listRegionFarmerTasks(region: string, district?: string): Promise<RegionFarmerTaskRow[]> {
  const where = farmerDistrictClause(district, region);
  const params = farmerDistrictParams(district, region);
  const rows = await query<{
    id: string;
    farmer_id: string;
    status: string;
    name: string;
    description?: string | null;
    due_date?: string | null;
    farmer_name?: string;
    program_project_name?: string;
    submitted_date?: string | null;
    completed_date?: string | null;
    payment_value_kes?: number;
    notes?: string | null;
    photo_evidence_url?: string | null;
    rejection_reason?: string | null;
  }>(
    `
    SELECT ft.id, ft.farmer_id, ft.status, t.name, t.description, t.due_date,
      f.name AS farmer_name, pp.name AS program_project_name,
      ft.submitted_date, ft.completed_date, t.payment_value_kes,
      ft.notes, ft.photo_evidence_url, ft.rejection_reason
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ${where}
    ORDER BY t.due_date NULLS LAST, t.name
    `,
    params
  );
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      photo_evidence_url: await resolvePhotoUrlForDisplay(row.photo_evidence_url),
      status: fromDbTaskStatus(row.status),
      source: 'farmer' as const,
    }))
  );
}

export async function listAgentPersonalTasks(agentUserId: string): Promise<AgentPersonalTask[]> {
  const rows = await query<AgentPersonalTask>(
    `SELECT * FROM agent_tasks WHERE agent_user_id = $1 ORDER BY due_date, name`,
    [agentUserId]
  );
  return Promise.all(rows.map((row) => enrichPersonalTask(row)));
}

/** Tasks a field agent assigned to this farmer (agent_tasks table, not farmer_tasks). */
export async function listAgentTasksAssignedToFarmer(farmerId: string): Promise<
  Array<AgentPersonalTask & { assigned_by_name?: string | null }>
> {
  const rows = await query<AgentPersonalTask & { assigned_by_name?: string | null }>(
    `
    SELECT at.*, u.name AS assigned_by_name
    FROM agent_tasks at
    LEFT JOIN users u ON u.user_id::text = at.agent_user_id
    WHERE at.assigned_farmer_ids IS NOT NULL
      AND TRIM(at.assigned_farmer_ids) != ''
    ORDER BY at.due_date, at.name
    `
  );
  return rows.filter((row) => parseAssignedFarmerIds(row.assigned_farmer_ids).includes(farmerId));
}

export async function getAgentPersonalTask(
  taskId: string,
  agentUserId: string
): Promise<AgentPersonalTask | null> {
  const row = await queryOne<AgentPersonalTask>(
    'SELECT * FROM agent_tasks WHERE id = $1 AND agent_user_id = $2',
    [taskId, agentUserId]
  );
  if (!row) return null;
  return enrichPersonalTask(row);
}

/** Load an agent_tasks row if this farmer is in assigned_farmer_ids. */
export async function getAgentTaskAssignedToFarmer(
  taskId: string,
  farmerId: string
): Promise<AgentPersonalTask | null> {
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  if (!row) return null;
  if (!parseAssignedFarmerIds(row.assigned_farmer_ids).includes(farmerId)) return null;
  return enrichPersonalTask(row);
}

const FARMER_SUBMIT_MIN_NOTES = 50;
const FARMER_SUBMITTABLE_STATUSES = new Set(['not_started', 'in_progress', 'rejected']);

/**
 * Farmer submits photo + notes evidence on an agent-assigned task.
 * Sets status to submitted_for_approval for field-agent review.
 */
export async function submitAgentTaskByFarmer(
  taskId: string,
  farmerId: string,
  data: { photo_url?: string; notes?: string }
): Promise<AgentPersonalTask> {
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  if (!row) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  if (!parseAssignedFarmerIds(row.assigned_farmer_ids).includes(farmerId)) {
    throw Object.assign(new Error('Not your task'), { statusCode: 403 });
  }

  const photo = typeof data.photo_url === 'string' ? data.photo_url.trim() : '';
  if (!photo) {
    throw Object.assign(new Error('A photo is required before submitting this task'), {
      statusCode: 400,
    });
  }

  const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
  if (notes.length < FARMER_SUBMIT_MIN_NOTES) {
    throw Object.assign(
      new Error(
        `Notes must be at least ${FARMER_SUBMIT_MIN_NOTES} characters (currently ${notes.length})`
      ),
      { statusCode: 400 }
    );
  }

  const current = normalizeAgentTaskStatus(row.status);
  if (!FARMER_SUBMITTABLE_STATUSES.has(current)) {
    throw Object.assign(
      new Error('This task is not open for submission (already submitted or completed)'),
      { statusCode: 409 }
    );
  }

  await query(
    `
    UPDATE agent_tasks SET
      photo_evidence_url = $1,
      notes = $2,
      status = 'submitted_for_approval',
      submitted_at = NOW(),
      rejection_reason = NULL,
      reviewed_at = NULL,
      updated_at = NOW()
    WHERE id = $3
    `,
    [photo, notes, taskId]
  );

  const farmer = await queryOne<{ name: string }>(
    'SELECT name FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );

  try {
    await createNotification({
      userId: row.agent_user_id,
      title: current === 'rejected' ? 'Task evidence resubmitted' : 'Task evidence submitted',
      message:
        current === 'rejected'
          ? `${farmer?.name ?? 'A farmer'} resubmitted evidence for "${row.name}". Review in your Tasks tab.`
          : `${farmer?.name ?? 'A farmer'} submitted evidence for "${row.name}". Review in your Tasks tab.`,
      type: 'task',
      contextType: 'agent_task',
      contextId: taskId,
      priority: 'high',
    });
  } catch {
    // Notification failure must not roll back a successful submit
  }

  const updated = await getAgentTaskAssignedToFarmer(taskId, farmerId);
  if (!updated) {
    throw Object.assign(new Error('Task not found after submit'), { statusCode: 500 });
  }
  return updated;
}

function parseFarmerStartDate(raw: string): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw Object.assign(new Error('Start date must be YYYY-MM-DD'), { statusCode: 400 });
  }
  const probe = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(probe.getTime())) {
    throw Object.assign(new Error('Start date must be a valid calendar day'), { statusCode: 400 });
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (probe.getTime() > today.getTime()) {
    throw Object.assign(new Error('Start date cannot be in the future'), { statusCode: 400 });
  }
  return trimmed;
}

/**
 * Farmer starts a not-started agent-assigned task.
 * Status → in_progress; sets farmer_started_at (farmer-picked date).
 */
export async function startAgentTaskByFarmer(
  taskId: string,
  farmerId: string,
  startDate: string
): Promise<AgentPersonalTask> {
  const day = parseFarmerStartDate(startDate);
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  if (!row) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  if (!parseAssignedFarmerIds(row.assigned_farmer_ids).includes(farmerId)) {
    throw Object.assign(new Error('Not your task'), { statusCode: 403 });
  }

  const current = normalizeAgentTaskStatus(row.status);
  if (current !== 'not_started') {
    throw Object.assign(new Error('Only not-started tasks can be started'), { statusCode: 409 });
  }

  await query(
    `
    UPDATE agent_tasks SET
      status = 'in_progress',
      farmer_started_at = $1::date,
      updated_at = NOW()
    WHERE id = $2
    `,
    [day, taskId]
  );

  const updated = await getAgentTaskAssignedToFarmer(taskId, farmerId);
  if (!updated) {
    throw Object.assign(new Error('Task not found after start'), { statusCode: 500 });
  }
  return updated;
}

/**
 * Farmer recalls evidence on an agent-assigned task before agent review.
 * Status → in_progress; photo + notes kept. 409 if not still submitted_for_approval.
 */
export async function recallAgentTaskByFarmer(
  taskId: string,
  farmerId: string
): Promise<AgentPersonalTask> {
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  if (!row) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  if (!parseAssignedFarmerIds(row.assigned_farmer_ids).includes(farmerId)) {
    throw Object.assign(new Error('Not your task'), { statusCode: 403 });
  }

  const current = normalizeAgentTaskStatus(row.status);
  if (current !== 'submitted_for_approval') {
    throw Object.assign(
      new Error('Only submitted tasks can be recalled (already reviewed or not submitted)'),
      { statusCode: 409 }
    );
  }

  await query(
    `
    UPDATE agent_tasks SET
      status = 'in_progress',
      submitted_at = NULL,
      reviewed_at = NULL,
      updated_at = NOW()
    WHERE id = $1
    `,
    [taskId]
  );

  const farmer = await queryOne<{ name: string }>(
    'SELECT name FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );

  try {
    await createNotification({
      userId: row.agent_user_id,
      title: 'Task evidence recalled',
      message: `${farmer?.name ?? 'A farmer'} recalled their submission for "${row.name}". It is no longer awaiting review.`,
      type: 'task',
      contextType: 'agent_task',
      contextId: taskId,
      priority: 'normal',
    });
  } catch {
    // best-effort
  }

  const updated = await getAgentTaskAssignedToFarmer(taskId, farmerId);
  if (!updated) {
    throw Object.assign(new Error('Task not found after recall'), { statusCode: 500 });
  }
  return updated;
}

export function normalizeAgentTaskDueDate(input: string): string {
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) {
    throw new Error('Due date must be DD/MM/YYYY');
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Due date must be DD/MM/YYYY');
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const probe = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(probe.getTime())) {
    throw new Error('Due date must be DD/MM/YYYY');
  }
  return iso;
}

export async function createAgentPersonalTask(
  agentUserId: string,
  data: {
    name: string;
    description?: string;
    due_date: string;
    priority?: string;
    assigned_farmers?: string[];
    reminder_type?: string;
  }
): Promise<AgentPersonalTask> {
  const id = uuidv4();
  const dueDate = normalizeAgentTaskDueDate(data.due_date);
  await query(
    `
    INSERT INTO agent_tasks (
      id, agent_user_id, name, description, due_date, priority, status,
      assigned_farmer_ids, reminder_type, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'not_started', $7, $8, NOW(), NOW())
    `,
    [
      id,
      agentUserId,
      data.name,
      data.description ?? null,
      dueDate,
      data.priority ?? 'medium',
      data.assigned_farmers ? JSON.stringify(data.assigned_farmers) : null,
      data.reminder_type ?? null,
    ]
  );
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [id]);
  const task = await enrichPersonalTask(row!);

  if (data.assigned_farmers?.length) {
    for (const farmerId of data.assigned_farmers) {
      const farmerUser = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM users WHERE farmer_id = $1 LIMIT 1',
        [farmerId]
      );
      if (farmerUser?.user_id) {
        await createNotification({
          userId: farmerUser.user_id,
          title: 'New task from your field agent',
          message: `Your field agent assigned you a task: ${data.name}. Due ${dueDate}.`,
          type: 'task',
          contextType: 'agent_task',
          contextId: id,
        });
      }
    }
  }

  return task;
}

export async function updateAgentPersonalTask(
  taskId: string,
  agentUserId: string,
  data: {
    status?: string;
    name?: string;
    description?: string | null;
    due_date?: string;
    priority?: string;
  }
): Promise<AgentPersonalTask | null> {
  const existing = await queryOne<AgentPersonalTask>(
    'SELECT * FROM agent_tasks WHERE id = $1 AND agent_user_id = $2',
    [taskId, agentUserId]
  );
  if (!existing) return null;

  const status = data.status ? normalizeAgentTaskStatus(data.status) : undefined;
  if (status && !AGENT_TASK_AGENT_EDITABLE_STATUSES.has(status)) {
    throw new Error(
      'Invalid task status — use approve/reject for farmer submissions, or not_started/in_progress/completed for personal todos'
    );
  }

  const dueDate = data.due_date ? normalizeAgentTaskDueDate(data.due_date) : undefined;

  await query(
    `
    UPDATE agent_tasks SET
      status = COALESCE($1, status),
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      due_date = COALESCE($4, due_date),
      priority = COALESCE($5, priority),
      updated_at = NOW()
    WHERE id = $6 AND agent_user_id = $7
    `,
    [
      status ?? null,
      data.name?.trim() ?? null,
      data.description ?? null,
      dueDate ?? null,
      data.priority ?? null,
      taskId,
      agentUserId,
    ]
  );

  return getAgentPersonalTask(taskId, agentUserId);
}

export async function updateAgentPersonalTaskReminder(
  taskId: string,
  agentUserId: string,
  reminderType: string
): Promise<void> {
  await query(
    `UPDATE agent_tasks SET reminder_type = $1, updated_at = NOW()
     WHERE id = $2 AND agent_user_id = $3`,
    [reminderType, taskId, agentUserId]
  );
}

async function notifyAssignedFarmers(
  task: AgentPersonalTask,
  title: string,
  message: string,
  type: string = 'task'
): Promise<void> {
  const farmerIds = parseAssignedFarmerIds(task.assigned_farmer_ids);
  for (const farmerId of farmerIds) {
    const farmerUser = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE farmer_id = $1 LIMIT 1',
      [farmerId]
    );
    if (!farmerUser?.user_id) continue;
    try {
      await createNotification({
        userId: farmerUser.user_id,
        title,
        message,
        type,
        contextType: 'agent_task',
        contextId: task.id,
        priority: 'high',
      });
    } catch {
      // best-effort
    }
  }
}

/** Field agent approves farmer evidence on an agent-assigned task. */
export async function approveAgentTaskByAgent(
  taskId: string,
  agentUserId: string,
  notes?: string
): Promise<AgentPersonalTask> {
  const existing = await queryOne<AgentPersonalTask>(
    'SELECT * FROM agent_tasks WHERE id = $1 AND agent_user_id = $2',
    [taskId, agentUserId]
  );
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  const current = normalizeAgentTaskStatus(existing.status);
  if (current !== 'submitted_for_approval') {
    throw Object.assign(
      new Error('Only tasks submitted for approval can be approved'),
      { statusCode: 409 }
    );
  }

  const reviewNotes =
    typeof notes === 'string' && notes.trim()
      ? notes.trim()
      : existing.notes ?? null;

  await query(
    `
    UPDATE agent_tasks SET
      status = 'approved',
      reviewed_at = NOW(),
      rejection_reason = NULL,
      notes = COALESCE($1, notes),
      updated_at = NOW()
    WHERE id = $2 AND agent_user_id = $3
    `,
    [reviewNotes, taskId, agentUserId]
  );

  const updated = await getAgentPersonalTask(taskId, agentUserId);
  if (!updated) {
    throw Object.assign(new Error('Task not found after approve'), { statusCode: 500 });
  }

  await notifyAssignedFarmers(
    updated,
    'Task approved',
    `Your field agent approved "${updated.name}".`,
    'task_approved'
  );
  return updated;
}

/** Field agent rejects farmer evidence — farmer can resubmit. */
export async function rejectAgentTaskByAgent(
  taskId: string,
  agentUserId: string,
  rejectionReason: string
): Promise<AgentPersonalTask> {
  const reason = rejectionReason.trim();
  if (!reason) {
    throw Object.assign(new Error('Rejection reason is required'), { statusCode: 400 });
  }

  const existing = await queryOne<AgentPersonalTask>(
    'SELECT * FROM agent_tasks WHERE id = $1 AND agent_user_id = $2',
    [taskId, agentUserId]
  );
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  const current = normalizeAgentTaskStatus(existing.status);
  if (current !== 'submitted_for_approval') {
    throw Object.assign(
      new Error('Only tasks submitted for approval can be rejected'),
      { statusCode: 409 }
    );
  }

  await query(
    `
    UPDATE agent_tasks SET
      status = 'rejected',
      rejection_reason = $1,
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = $2 AND agent_user_id = $3
    `,
    [reason, taskId, agentUserId]
  );

  const updated = await getAgentPersonalTask(taskId, agentUserId);
  if (!updated) {
    throw Object.assign(new Error('Task not found after reject'), { statusCode: 500 });
  }

  await notifyAssignedFarmers(
    updated,
    'Task rejected',
    `Your field agent rejected "${updated.name}". Reason: ${reason}. Please resubmit.`,
    'task_rejected'
  );
  return updated;
}

export async function getProjectManagerUserForAgent(region?: string, district?: string) {
  try {
    const row = await queryOne<{ user_id: string; name: string; phone_number: string }>(
      `
      SELECT user_id::text AS user_id, name, phone_number FROM users
      WHERE role::text IN ('project_manager', 'admin', 'super_admin', 'platform_admin')
        AND phone_number IS NOT NULL
        AND (
          ($1::text IS NOT NULL AND region = $1)
          OR ($2::text IS NOT NULL AND district = $2)
        )
      ORDER BY CASE role::text
        WHEN 'project_manager' THEN 0
        WHEN 'platform_admin' THEN 1
        WHEN 'super_admin' THEN 2
        WHEN 'admin' THEN 3
        ELSE 4
      END
      LIMIT 1
      `,
      [region ?? null, district ?? null]
    );
    if (row) return row;

    return await queryOne<{ user_id: string; name: string; phone_number: string }>(
      `
      SELECT user_id::text AS user_id, name, phone_number FROM users
      WHERE role::text IN ('project_manager', 'admin', 'super_admin', 'platform_admin')
        AND phone_number IS NOT NULL
      ORDER BY CASE role::text
        WHEN 'project_manager' THEN 0
        WHEN 'platform_admin' THEN 1
        WHEN 'super_admin' THEN 2
        WHEN 'admin' THEN 3
        ELSE 4
      END
      LIMIT 1
      `
    );
  } catch {
    return null;
  }
}

export async function getProjectManagerForAgent(region?: string, district?: string) {
  const pm = await getProjectManagerUserForAgent(region, district);
  return pm ? { name: pm.name, phone_number: pm.phone_number } : null;
}

export async function getAgentDashboardSummary(
  agentUserId: string,
  region: string,
  district?: string
) {
  const farmers = await getFarmersInRegion(region, district);
  const farmersCount = farmers.length;
  const pendingReview = farmers.filter((f) => f.status === 'pending_review').length;
  const pendingFieldVerification = farmers.filter((f) => f.status === 'pending_field_verification').length;
  const verified = farmers.filter((f) => f.status === 'verified').length;
  const inactive = farmers.filter((f) => f.status === 'inactive').length;
  const rejected = farmers.filter((f) => f.status === 'rejected').length;

  const farmerTasks = await listRegionFarmerTasks(region, district);
  const personalTasks = await listAgentPersonalTasks(agentUserId);

  const allTasksForCounts = [
    ...farmerTasks.map((t) => ({
      status: t.status ?? 'not-started',
      due_date: t.due_date,
    })),
    ...personalTasks.map((t) => ({
      status: t.status ?? 'not_started',
      due_date: t.due_date,
    })),
  ];
  const categoryCounts = countTaskCategories(allTasksForCounts);

  const allRecentTasks = [
    ...farmerTasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status ?? 'not-started',
      due_date: t.due_date,
      farmer_name: t.farmer_name,
      source: 'farmer' as const,
    })),
    ...personalTasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: (t.status ?? 'not_started').replace(/_/g, '-'),
      due_date: t.due_date,
      farmer_name: t.assigned_farmer_names?.join(', ') || 'You',
      source: 'personal' as const,
    })),
  ].sort((a, b) => compareDueDates(a.due_date, b.due_date));

  const overdueTasks = [
    ...farmerTasks.filter(
      (t) =>
        classifyTaskDue(t.due_date).overdue &&
        !['approved', 'completed'].includes(String(t.status ?? '').replace(/_/g, '-'))
    ),
    ...personalTasks.filter(
      (t) => classifyTaskDue(t.due_date).overdue && t.status !== 'completed'
    ),
  ].map((t) => ({
    id: t.id,
    name: t.name,
    daysOverdue: classifyTaskDue(t.due_date).daysOverdue,
  }));

  const pm = await getProjectManagerForAgent(region, district);

  return {
    agent: {
      region,
      district,
    },
    farmers: {
      total: farmersCount,
      pending_review: pendingReview,
      pending_field_verification: pendingFieldVerification,
      pending_verification: pendingReview + pendingFieldVerification,
      verified,
      inactive,
      rejected,
    },
    tasks: {
      overdue_count: categoryCounts.overdue,
      in_progress_count: categoryCounts.inProgress,
      not_started_count: categoryCounts.notStarted,
      submitted_for_approval_count: categoryCounts.submittedForApproval,
      completed_count: categoryCounts.completed,
      rejected_count: categoryCounts.rejected,
      total_count: categoryCounts.total,
      overdue: overdueTasks.slice(0, 5),
      recent: allRecentTasks.slice(0, 5),
    },
    recent_farmers: farmers.slice(0, 5).map((f) => ({
      farmer_id: f.farmer_id,
      name: f.name,
      phone_number: f.phone_number,
      district: f.district,
      sub_county: f.sub_county,
      status: f.status,
    })),
    project_manager: pm
      ? { name: pm.name, phone: pm.phone_number }
      : null,
  };
}
