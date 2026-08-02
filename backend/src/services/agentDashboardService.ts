import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { getFarmersInRegion } from './agentService';
import { fromDbTaskStatus } from './hierarchyService';

export interface AgentPersonalTask {
  id: string;
  agent_user_id: string;
  name: string;
  description?: string | null;
  due_date: string;
  priority: string;
  status: string;
  assigned_farmer_ids?: string | null;
  reminder_type?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: 'personal';
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
  await query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_agent_tasks_due ON agent_tasks(due_date)');
}

export async function listRegionFarmerTasks(region: string, district?: string): Promise<RegionFarmerTaskRow[]> {
  const where = farmerDistrictClause(district, region);
  const params = farmerDistrictParams(district, region);
  const rows = await query<{
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
  }>(
    `
    SELECT ft.id, ft.farmer_id, ft.status, t.name, t.due_date,
      f.name AS farmer_name, pp.name AS program_project_name,
      ft.submitted_date, ft.completed_date, t.payment_value_kes,
      ft.notes, ft.photo_evidence_url
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ${where}
    ORDER BY t.due_date NULLS LAST, t.name
    `,
    params
  );
  return rows.map((row) => ({
    ...row,
    status: fromDbTaskStatus(row.status),
    source: 'farmer' as const,
  }));
}

export async function listAgentPersonalTasks(agentUserId: string): Promise<AgentPersonalTask[]> {
  const rows = await query<AgentPersonalTask>(
    `SELECT * FROM agent_tasks WHERE agent_user_id = $1 ORDER BY due_date, name`,
    [agentUserId]
  );
  return rows.map((row) => ({ ...row, source: 'personal' as const }));
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
      data.due_date,
      data.priority ?? 'medium',
      data.assigned_farmers ? JSON.stringify(data.assigned_farmers) : null,
      data.reminder_type ?? null,
    ]
  );
  const row = await queryOne<AgentPersonalTask>('SELECT * FROM agent_tasks WHERE id = $1', [id]);
  return { ...row!, source: 'personal' };
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

export async function getProjectManagerForAgent(region?: string, district?: string) {
  const row = await queryOne<{ name: string; phone_number: string }>(
    `
    SELECT name, phone_number FROM users
    WHERE role::text IN ('admin', 'super_admin', 'platform_admin')
      AND phone_number IS NOT NULL
      AND (
        ($1::text IS NOT NULL AND region = $1)
        OR ($2::text IS NOT NULL AND district = $2)
      )
    ORDER BY CASE role::text
      WHEN 'platform_admin' THEN 0
      WHEN 'super_admin' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3
    END
    LIMIT 1
    `,
    [region ?? null, district ?? null]
  );
  if (row) return row;
  return queryOne<{ name: string; phone_number: string }>(
    `
    SELECT name, phone_number FROM users
    WHERE role::text IN ('admin', 'super_admin', 'platform_admin')
      AND phone_number IS NOT NULL
    ORDER BY CASE role::text
      WHEN 'platform_admin' THEN 0
      WHEN 'super_admin' THEN 1
      WHEN 'admin' THEN 2
      ELSE 3
    END
    LIMIT 1
    `
  );
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

  const outstandingFarmer = farmerTasks.filter(
    (t) => !['approved', 'completed'].includes(t.status)
  );

  const allDated = [
    ...outstandingFarmer.filter((t) => t.due_date),
    ...personalTasks.filter((t) => t.status !== 'completed'),
  ];

  const upcomingTasks = allDated.filter((t) => classifyTaskDue(t.due_date).upcoming);
  const overdueTasks = allDated
    .filter((t) => classifyTaskDue(t.due_date).overdue)
    .map((t) => ({
      ...t,
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
      upcoming_count: upcomingTasks.length,
      overdue_count: overdueTasks.length,
      upcoming: upcomingTasks.slice(0, 5),
      overdue: overdueTasks.slice(0, 5),
    },
    project_manager: pm
      ? { name: pm.name, phone: pm.phone_number }
      : null,
  };
}
