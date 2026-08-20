import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import { resolveFarmerAppUserId } from './farmerAppUser';

/** Adds assigner tracking on farmer_tasks for farmer portal "assigned by" display. */
export async function ensureFarmerTaskAssignerColumn(): Promise<void> {
  // No FK — Supabase users.user_id is often UUID while farmer_tasks ids are TEXT.
  await query(`
    ALTER TABLE farmer_tasks
    ADD COLUMN IF NOT EXISTS assigned_by_user_id TEXT
  `);
  await ensureFarmerTaskInProgressStatus();
  await ensureFarmerTaskStartedAtColumn();
}

/** Farmer-picked start date when they start a not-started task. */
export async function ensureFarmerTaskStartedAtColumn(): Promise<void> {
  await query(`
    ALTER TABLE farmer_tasks
    ADD COLUMN IF NOT EXISTS farmer_started_at DATE
  `);
}

/**
 * Recall returns submissions to in-progress (not not-started).
 * Legacy task_status enums only had not-started/submitted/approved/rejected/completed.
 */
export async function ensureFarmerTaskInProgressStatus(): Promise<void> {
  const row = await queryOne<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'task_status' AND e.enumlabel = 'in-progress'
    ) AS exists
  `);
  if (row?.exists) return;
  await query(`ALTER TYPE task_status ADD VALUE 'in-progress'`);
}

export function toDbTaskStatus(status: string): string {
  return status === 'submitted-for-approval' ? 'submitted' : status;
}

export function fromDbTaskStatus(status: string): string {
  return status === 'submitted' ? 'submitted-for-approval' : status;
}

function mapFarmerTaskRow<T extends { status?: string }>(row: T): T {
  if (row.status === undefined) return row;
  return { ...row, status: fromDbTaskStatus(row.status) };
}

function mapFarmerTaskRows<T extends { status?: string }>(rows: T[]): T[] {
  return rows.map(mapFarmerTaskRow);
}

async function refreshProjectTaskCounts(programProjectId: string): Promise<void> {
  const total = await queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM tasks WHERE program_project_id = $1',
    [programProjectId]
  );
  const completed = await queryOne<{ c: number }>(`
    SELECT COUNT(DISTINCT ft.task_id)::int AS c FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    WHERE t.program_project_id = $1 AND ft.status IN ('approved', 'completed')
  `, [programProjectId]);
  await query(`
    UPDATE program_projects SET total_tasks = $1, completed_tasks = $2, updated_at = NOW()
    WHERE id = $3
  `, [total?.c ?? 0, completed?.c ?? 0, programProjectId]);
}

export async function listSectors() {
  return query('SELECT * FROM sectors ORDER BY name');
}

export async function createSector(data: { name: string; description?: string; country?: string }) {
  const id = uuidv4();
  await query(
    'INSERT INTO sectors (id, name, description, country) VALUES ($1, $2, $3, $4)',
    [id, data.name, data.description ?? null, data.country ?? null]
  );
  return queryOne('SELECT * FROM sectors WHERE id = $1', [id]);
}

export async function updateSector(id: string, data: { name?: string; description?: string; country?: string }) {
  await query(`
    UPDATE sectors SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      country = COALESCE($3, country),
      updated_at = NOW()
    WHERE id = $4
  `, [data.name ?? null, data.description ?? null, data.country ?? null, id]);
  return queryOne('SELECT * FROM sectors WHERE id = $1', [id]);
}

export async function deleteSector(id: string): Promise<boolean> {
  const programs = await queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM programs WHERE sector_id = $1',
    [id]
  );
  if ((programs?.c ?? 0) > 0) throw new Error('Sector has programs — delete programs first');
  const deleted = await queryOne<{ id: string }>(
    'DELETE FROM sectors WHERE id = $1 RETURNING id',
    [id]
  );
  return deleted !== null;
}

export async function listPrograms(sectorId?: string) {
  if (sectorId) {
    return query(`
      SELECT p.*, s.name AS sector_name FROM programs p
      JOIN sectors s ON s.id = p.sector_id
      WHERE p.sector_id = $1 ORDER BY p.name
    `, [sectorId]);
  }
  return query(`
    SELECT p.*, s.name AS sector_name FROM programs p
    JOIN sectors s ON s.id = p.sector_id ORDER BY s.name, p.name
  `);
}

export async function createProgram(data: { name: string; sector_id: string; description?: string; budget_kes?: number }) {
  const id = uuidv4();
  await query(
    'INSERT INTO programs (id, sector_id, name, description, budget_kes) VALUES ($1, $2, $3, $4, $5)',
    [id, data.sector_id, data.name, data.description ?? null, data.budget_kes ?? null]
  );
  return getProgram(id);
}

export async function updateProgram(id: string, data: { name?: string; sector_id?: string; description?: string; budget_kes?: number }) {
  await query(`
    UPDATE programs SET
      name = COALESCE($1, name),
      sector_id = COALESCE($2, sector_id),
      description = COALESCE($3, description),
      budget_kes = COALESCE($4, budget_kes),
      updated_at = NOW()
    WHERE id = $5
  `, [data.name ?? null, data.sector_id ?? null, data.description ?? null, data.budget_kes ?? null, id]);
  return getProgram(id);
}

export async function deleteProgram(id: string): Promise<boolean> {
  const projects = await queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM program_projects WHERE program_id = $1',
    [id]
  );
  if ((projects?.c ?? 0) > 0) throw new Error('Program has projects — delete projects first');
  const deleted = await queryOne<{ id: string }>(
    'DELETE FROM programs WHERE id = $1 RETURNING id',
    [id]
  );
  return deleted !== null;
}

export async function getProgram(id: string) {
  return queryOne(`
    SELECT p.*, s.name AS sector_name FROM programs p
    JOIN sectors s ON s.id = p.sector_id WHERE p.id = $1
  `, [id]);
}

export async function listProgramProjects(programId?: string) {
  const sql = `
    SELECT pp.*, p.name AS program_name, s.name AS sector_name,
      (SELECT COUNT(*)::int FROM program_project_farmers pf WHERE pf.program_project_id = pp.id) AS farmers_count,
      CASE WHEN pp.total_tasks > 0 THEN ROUND(100.0 * pp.completed_tasks / pp.total_tasks) ELSE 0 END AS progress_percent
    FROM program_projects pp
    JOIN programs p ON p.id = pp.program_id
    JOIN sectors s ON s.id = p.sector_id
    ${programId ? 'WHERE pp.program_id = $1' : ''}
    ORDER BY pp.created_at DESC
  `;
  return programId ? query(sql, [programId]) : query(sql);
}

export async function createProgramProject(data: {
  name: string;
  program_id: string;
  region?: string;
  budget_kes?: number;
  start_date?: string;
  end_date?: string;
  country_manager_id?: string;
}) {
  const id = uuidv4();
  await query(`
    INSERT INTO program_projects (id, program_id, name, region, budget_kes, start_date, end_date, country_manager_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    id, data.program_id, data.name, data.region ?? null, data.budget_kes ?? null,
    data.start_date ?? null, data.end_date ?? null, data.country_manager_id ?? null,
  ]);
  return getProgramProject(id);
}

export async function updateProgramProject(id: string, data: {
  name?: string;
  program_id?: string;
  region?: string;
  budget_kes?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}) {
  await query(`
    UPDATE program_projects SET
      name = COALESCE($1, name),
      program_id = COALESCE($2, program_id),
      region = COALESCE($3, region),
      budget_kes = COALESCE($4, budget_kes),
      start_date = COALESCE($5, start_date),
      end_date = COALESCE($6, end_date),
      status = COALESCE($7, status),
      updated_at = NOW()
    WHERE id = $8
  `, [
    data.name ?? null, data.program_id ?? null, data.region ?? null, data.budget_kes ?? null,
    data.start_date ?? null, data.end_date ?? null, data.status ?? null, id,
  ]);
  return getProgramProject(id);
}

export async function deleteProgramProject(id: string): Promise<boolean> {
  await query('DELETE FROM farmer_tasks WHERE program_project_id = $1', [id]);
  await query('DELETE FROM program_project_farmers WHERE program_project_id = $1', [id]);
  await query('DELETE FROM tasks WHERE program_project_id = $1', [id]);
  const deleted = await queryOne<{ id: string }>(
    'DELETE FROM program_projects WHERE id = $1 RETURNING id',
    [id]
  );
  return deleted !== null;
}

export async function getProgramProject(id: string) {
  const project = await queryOne(`
    SELECT pp.*, p.name AS program_name, s.name AS sector_name,
      (SELECT COUNT(*)::int FROM program_project_farmers pf WHERE pf.program_project_id = pp.id) AS farmers_count,
      CASE WHEN pp.total_tasks > 0 THEN ROUND(100.0 * pp.completed_tasks / pp.total_tasks) ELSE 0 END AS progress_percent
    FROM program_projects pp
    JOIN programs p ON p.id = pp.program_id
    JOIN sectors s ON s.id = p.sector_id
    WHERE pp.id = $1
  `, [id]);
  if (!project) return null;

  const tasks = await listTasks(id);
  const farmers = await query(`
    SELECT f.farmer_id, f.name, f.phone_number, f.district, pf.status
    FROM program_project_farmers pf
    JOIN farmers f ON f.farmer_id = pf.farmer_id
    WHERE pf.program_project_id = $1
  `, [id]);

  return { ...project, tasks, farmers };
}

export async function listTasks(programProjectId: string, filters?: { status?: string; farmer_id?: string }) {
  if (filters?.farmer_id) {
    if (filters.status) {
      return query(`
        SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
          f.name AS farmer_name
        FROM farmer_tasks ft
        JOIN tasks t ON t.id = ft.task_id
        JOIN farmers f ON f.farmer_id = ft.farmer_id
        WHERE ft.program_project_id = $1 AND ft.farmer_id = $2 AND ft.status = $3
        ORDER BY t.task_order
      `, [programProjectId, filters.farmer_id, filters.status]);
    }
    return query(`
      SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
        f.name AS farmer_name
      FROM farmer_tasks ft
      JOIN tasks t ON t.id = ft.task_id
      JOIN farmers f ON f.farmer_id = ft.farmer_id
      WHERE ft.program_project_id = $1 AND ft.farmer_id = $2
      ORDER BY t.task_order
    `, [programProjectId, filters.farmer_id]);
  }

  return query(`
    SELECT t.*, (
      SELECT COUNT(*)::int FROM farmer_tasks ft WHERE ft.task_id = t.id AND ft.status IN ('approved','completed')
    ) AS completed_count
    FROM tasks t WHERE t.program_project_id = $1 ORDER BY t.task_order
  `, [programProjectId]);
}

export async function createTask(data: {
  program_project_id: string;
  name: string;
  description?: string;
  task_order: number;
  payment_value_kes?: number;
  due_date?: string;
  assigned_agronomist_id?: string;
}) {
  const id = uuidv4();
  await query(`
    INSERT INTO tasks (id, program_project_id, name, description, task_order, payment_value_kes, due_date, assigned_agronomist_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    id, data.program_project_id, data.name, data.description ?? null, data.task_order,
    data.payment_value_kes ?? 0, data.due_date ?? null, data.assigned_agronomist_id ?? null,
  ]);
  await refreshProjectTaskCounts(data.program_project_id);

  const existingFarmers = await query<{ farmer_id: string }>(
    'SELECT farmer_id FROM program_project_farmers WHERE program_project_id = $1',
    [data.program_project_id]
  );
  if (existingFarmers.length > 0) {
    await assignFarmersToProject(
      data.program_project_id,
      existingFarmers.map((f) => f.farmer_id),
      [id]
    );
  }

  return queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
}

export async function updateTask(id: string, data: {
  name?: string;
  description?: string;
  task_order?: number;
  payment_value_kes?: number;
  due_date?: string;
}) {
  const row = await queryOne<{ program_project_id: string }>(
    'SELECT program_project_id FROM tasks WHERE id = $1',
    [id]
  );
  if (!row) return null;
  await query(`
    UPDATE tasks SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      task_order = COALESCE($3, task_order),
      payment_value_kes = COALESCE($4, payment_value_kes),
      due_date = COALESCE($5, due_date),
      updated_at = NOW()
    WHERE id = $6
  `, [
    data.name ?? null, data.description ?? null, data.task_order ?? null,
    data.payment_value_kes ?? null, data.due_date ?? null, id,
  ]);
  await refreshProjectTaskCounts(row.program_project_id);
  return queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
}

export async function deleteTask(id: string): Promise<boolean> {
  const row = await queryOne<{ program_project_id: string }>(
    'SELECT program_project_id FROM tasks WHERE id = $1',
    [id]
  );
  if (!row) return false;
  await query('DELETE FROM farmer_tasks WHERE task_id = $1', [id]);
  const deleted = await queryOne<{ id: string }>(
    'DELETE FROM tasks WHERE id = $1 RETURNING id',
    [id]
  );
  await refreshProjectTaskCounts(row.program_project_id);
  return deleted !== null;
}

export async function reorderTask(id: string, direction: 'up' | 'down') {
  const task = await queryOne<{
    id: string;
    program_project_id: string;
    task_order: number;
  }>('SELECT * FROM tasks WHERE id = $1', [id]);
  if (!task) return null;
  const neighbor = await queryOne<{ id: string; task_order: number }>(`
    SELECT * FROM tasks WHERE program_project_id = $1
      AND task_order ${direction === 'up' ? '<' : '>'} $2
    ORDER BY task_order ${direction === 'up' ? 'DESC' : 'ASC'}
    LIMIT 1
  `, [task.program_project_id, task.task_order]);
  if (!neighbor) return queryOne('SELECT * FROM tasks WHERE id = $1', [id]);
  await query('UPDATE tasks SET task_order = $1, updated_at = NOW() WHERE id = $2', [neighbor.task_order, task.id]);
  await query('UPDATE tasks SET task_order = $1, updated_at = NOW() WHERE id = $2', [task.task_order, neighbor.id]);
  return listTasks(task.program_project_id);
}

export async function listProjectFarmers(programProjectId: string) {
  return query(`
    SELECT f.farmer_id, f.name, f.phone_number, pf.status, pf.created_at AS assigned_date,
      (SELECT STRING_AGG(t.name, ' · ' ORDER BY t.task_order) FROM farmer_tasks ft
        JOIN tasks t ON t.id = ft.task_id
        WHERE ft.farmer_id = f.farmer_id AND ft.program_project_id = pf.program_project_id) AS assigned_tasks
    FROM program_project_farmers pf
    JOIN farmers f ON f.farmer_id = pf.farmer_id
    WHERE pf.program_project_id = $1
    ORDER BY pf.created_at DESC
  `, [programProjectId]);
}

export async function removeFarmerFromProject(programProjectId: string, farmerId: string): Promise<boolean> {
  await query(
    'DELETE FROM farmer_tasks WHERE program_project_id = $1 AND farmer_id = $2',
    [programProjectId, farmerId]
  );
  const deleted = await queryOne<{ id: string }>(`
    DELETE FROM program_project_farmers WHERE program_project_id = $1 AND farmer_id = $2 RETURNING id
  `, [programProjectId, farmerId]);
  return deleted !== null;
}

export async function assignFarmersToProject(
  programProjectId: string,
  farmerIds: string[],
  taskIds?: string[],
  assignedByUserId?: string | null
) {
  let taskRows: { id: string }[];
  if (taskIds && taskIds.length > 0) {
    const placeholders = taskIds.map((_, i) => `$${i + 2}`).join(',');
    taskRows = await query<{ id: string }>(
      `SELECT id FROM tasks WHERE program_project_id = $1 AND id IN (${placeholders})`,
      [programProjectId, ...taskIds]
    );
  } else {
    taskRows = await query<{ id: string }>(
      'SELECT id FROM tasks WHERE program_project_id = $1',
      [programProjectId]
    );
  }

  let assigned = 0;
  const newFarmerTaskIds: string[] = [];
  for (const farmerId of farmerIds) {
    await query(`
      INSERT INTO program_project_farmers (id, program_project_id, farmer_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (program_project_id, farmer_id) DO NOTHING
    `, [uuidv4(), programProjectId, farmerId]);
    for (const t of taskRows) {
      const inserted = await queryOne<{ id: string }>(`
        INSERT INTO farmer_tasks (id, task_id, farmer_id, program_project_id, assigned_by_user_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (task_id, farmer_id) DO NOTHING
        RETURNING id
      `, [uuidv4(), t.id, farmerId, programProjectId, assignedByUserId ?? null]);
      if (inserted?.id) newFarmerTaskIds.push(inserted.id);
    }
    assigned++;
  }
  await notifyFarmersOfNewTaskAssignments(newFarmerTaskIds);
  return { assigned, farmer_ids: farmerIds, task_ids: taskRows.map((t) => t.id) };
}

async function notifyFarmersOfNewTaskAssignments(farmerTaskIds: string[]): Promise<void> {
  if (farmerTaskIds.length === 0) return;

  const placeholders = farmerTaskIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await query<{
    id: string;
    farmer_id: string;
    name: string;
    program_project_name: string;
    due_date: string | null;
  }>(
    `
    SELECT ft.id, ft.farmer_id, t.name, pp.name AS program_project_name, t.due_date::text AS due_date
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ft.id IN (${placeholders})
    `,
    farmerTaskIds
  );

  const { createNotification } = await import('./notificationService');

  for (const row of rows) {
    const farmerUserId = await resolveFarmerAppUserId(row.farmer_id);
    const due = row.due_date ? ` Due ${row.due_date}.` : '';
    try {
      if (farmerUserId) {
        await createNotification({
          userId: farmerUserId,
          title: 'New Task Assigned',
          message: `You have been assigned "${row.name}" on ${row.program_project_name}.${due}`,
          type: 'task_assigned',
          contextType: 'farmer_task',
          contextId: row.id,
          actionUrl: `/tasks/${row.id}`,
          priority: 'high',
        });
      }
      const farmerName =
        (
          await queryOne<{ name: string | null }>(
            'SELECT name FROM farmers WHERE farmer_id = $1',
            [row.farmer_id]
          )
        )?.name?.trim() || 'A farmer';
      for (const agentUserId of await resolveAgentUserIdsForFarmer(row.farmer_id)) {
        await createNotification({
          userId: agentUserId,
          title: 'New Task Assigned',
          message: `${farmerName} was assigned "${row.name}" on ${row.program_project_name}.`,
          type: 'task_assigned',
          contextType: 'farmer_task',
          contextId: row.id,
          actionUrl: `/tasks/${row.id}`,
          priority: 'normal',
        });
      }
    } catch {
      // best-effort
    }
  }
}

const FARMER_TASK_DETAIL_SQL = `
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      pp.name AS program_project_name, f.name AS farmer_name, f.phone_number AS farmer_phone
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id`;

/** Row shape returned by FARMER_TASK_DETAIL_SQL (status mapped for API consumers). */
export type FarmerTaskDetailRow = {
  id: string;
  task_id?: string;
  farmer_id?: string;
  name?: string;
  description?: string;
  status?: string;
  task_order?: number;
  payment_value_kes?: number;
  due_date?: string | null;
  program_project_name?: string;
  farmer_name?: string;
  farmer_phone?: string;
  photo_evidence_url?: string | null;
  notes?: string | null;
  approved_date?: string | null;
  rejection_reason?: string | null;
  submitted_date?: string | null;
  farmer_started_at?: string | null;
  assigned_at?: string | null;
  created_at?: string | null;
};

export async function getFarmerTask(farmerTaskId: string): Promise<FarmerTaskDetailRow | null> {
  const row = await queryOne(`${FARMER_TASK_DETAIL_SQL} WHERE ft.id = $1`, [farmerTaskId]);
  if (!row) return null;
  return mapFarmerTaskRow(row as FarmerTaskDetailRow);
}

/** Resolve by farmer_tasks.id or program tasks.id (task template) for one farmer. */
export async function getFarmerTaskForFarmer(
  farmerId: string,
  taskRef: string
): Promise<FarmerTaskDetailRow | null> {
  const row = await queryOne(
    `${FARMER_TASK_DETAIL_SQL}
     WHERE ft.farmer_id = $1 AND (ft.id = $2 OR ft.task_id = $2)`,
    [farmerId, taskRef]
  );
  if (!row) return null;
  return mapFarmerTaskRow(row as FarmerTaskDetailRow);
}

/** User ids of field agents who should review this farmer's hierarchy tasks. */
async function resolveAgentUserIdsForFarmer(farmerId: string): Promise<string[]> {
  const farmer = await queryOne<{
    district: string | null;
    registered_by_agent_id: string | null;
  }>(
    `SELECT district, registered_by_agent_id FROM farmers WHERE farmer_id = $1`,
    [farmerId]
  );
  if (!farmer) return [];

  const ids = new Set<string>();

  if (farmer.registered_by_agent_id) {
    const registered = await queryOne<{ user_id: string }>(
      `SELECT u.user_id::text AS user_id
       FROM agents a
       JOIN users u ON u.user_id = a.user_id
       WHERE a.agent_id = $1`,
      [farmer.registered_by_agent_id]
    );
    if (registered?.user_id) ids.add(registered.user_id);
  }

  if (farmer.district) {
    const districtAgents = await query<{ user_id: string }>(
      `SELECT DISTINCT u.user_id::text AS user_id
       FROM agents a
       JOIN users u ON u.user_id = a.user_id
       WHERE a.district = $1 AND (a.status IS NULL OR a.status = 'active')`,
      [farmer.district]
    );
    for (const row of districtAgents) {
      if (row.user_id) ids.add(row.user_id);
    }
  }

  return [...ids];
}

/**
 * In-app notify for field agents when a farmer submits hierarchy task evidence.
 * context_type=farmer_task so the agent app can deep-link to Tasks.
 */
export async function notifyAgentsOfFarmerTaskSubmission(
  farmerTaskId: string,
  options?: { resubmitted?: boolean }
): Promise<void> {
  const task = (await getFarmerTask(farmerTaskId)) as {
    id?: string;
    farmer_id?: string;
    name?: string;
    farmer_name?: string;
  } | null;
  if (!task?.farmer_id || !task.id) return;

  const agentUserIds = await resolveAgentUserIdsForFarmer(task.farmer_id);
  if (agentUserIds.length === 0) return;

  const { createNotification } = await import('./notificationService');
  const farmerName = task.farmer_name ?? 'A farmer';
  const taskName = task.name ?? 'a task';
  const resubmitted = Boolean(options?.resubmitted);
  const title = resubmitted ? 'Task evidence resubmitted' : 'Task evidence submitted';
  const message = resubmitted
    ? `${farmerName} resubmitted evidence for "${taskName}". Review in your Tasks tab.`
    : `${farmerName} submitted evidence for "${taskName}". Review in your Tasks tab.`;

  for (const userId of agentUserIds) {
    try {
      await createNotification({
        userId,
        title,
        message,
        type: 'task',
        contextType: 'farmer_task',
        contextId: task.id,
        priority: 'high',
      });
    } catch {
      // best-effort
    }
  }
}

export async function listFarmerTasks(
  farmerId: string,
  filters?: { status?: string; program_project_id?: string; outstanding?: boolean }
) {
  let sql = `
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      pp.name AS program_project_name,
      ft.created_at AS assigned_at,
      COALESCE(assigner.name, manager.name, 'Kilimo Bridge') AS assigned_by_name,
      assigner.user_id AS assigned_by_user_id
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    LEFT JOIN users assigner ON assigner.user_id::text = ft.assigned_by_user_id::text
    LEFT JOIN users manager ON manager.user_id::text = pp.country_manager_id::text
    WHERE ft.farmer_id = $1
  `;
  const params: unknown[] = [farmerId];
  if (filters?.program_project_id) {
    params.push(filters.program_project_id);
    sql += ` AND ft.program_project_id = $${params.length}`;
  }
  if (filters?.status) {
    params.push(toDbTaskStatus(filters.status));
    sql += ` AND ft.status = $${params.length}`;
  }
  if (filters?.outstanding) {
    sql += ` AND ft.status NOT IN ('approved', 'completed')`;
  }
  sql += ' ORDER BY t.due_date NULLS LAST, pp.name, t.task_order';
  const rows = await query<{ status?: string }>(sql, params);
  return mapFarmerTaskRows(rows);
}

export async function listFarmerProgramProjects(farmerId: string) {
  return query(`
    SELECT pp.id, pp.name, pp.status, pp.start_date, pp.end_date, pp.budget_kes, pp.program_id,
      p.name AS program_name,
      (SELECT COUNT(*)::int FROM farmer_tasks ft WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1) AS assigned_task_count,
      (SELECT COUNT(*)::int FROM farmer_tasks ft
        JOIN tasks t ON t.id = ft.task_id
        WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1
          AND (
            ft.status IN ('approved','completed')
            OR EXISTS (
              SELECT 1 FROM payments p
              WHERE p.farmer_id = ft.farmer_id
                AND lower(p.payment_status::text) IN ('transferred', 'paid')
                AND (
                  p.description = 'Task:' || ft.id
                  OR ABS(COALESCE(p.amount, 0) - COALESCE(t.payment_value_kes, 0)) < 1
                )
            )
            OR EXISTS (
              SELECT 1 FROM bank_transactions bt
              WHERE bt.farmer_id = ft.farmer_id
                AND bt.status = 'completed'
                AND ABS(COALESCE(bt.amount, 0) - COALESCE(t.payment_value_kes, 0)) < 1
            )
          )
      ) AS completed_task_count
    FROM program_project_farmers pf
    JOIN program_projects pp ON pp.id = pf.program_project_id
    JOIN programs p ON p.id = pp.program_id
    WHERE pf.farmer_id = $1
    ORDER BY pp.name
  `, [farmerId]);
}

export async function submitFarmerTask(farmerTaskId: string, data: { photo_url?: string; notes?: string }) {
  const existing = await queryOne<{ status: string }>(
    'SELECT status FROM farmer_tasks WHERE id = $1',
    [farmerTaskId]
  );
  const prior = (existing?.status ?? '').toLowerCase();
  const resubmitted = prior === 'rejected' || prior === 'submitted';

  await query(`
    UPDATE farmer_tasks SET status = 'submitted', submitted_date = NOW(),
      photo_evidence_url = $1, notes = $2, rejection_reason = NULL, updated_at = NOW()
    WHERE id = $3
  `, [data.photo_url ?? null, data.notes ?? null, farmerTaskId]);

  const updated = await getFarmerTask(farmerTaskId);
  await notifyAgentsOfFarmerTaskSubmission(farmerTaskId, { resubmitted });
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
 * Farmer starts a not-started hierarchy task: status → in-progress, sets farmer_started_at.
 */
export async function startFarmerTask(
  farmerTaskId: string,
  farmerId: string,
  startDate: string
) {
  const day = parseFarmerStartDate(startDate);
  const existing = await queryOne<{ status: string; farmer_id: string }>(
    'SELECT status, farmer_id FROM farmer_tasks WHERE id = $1',
    [farmerTaskId]
  );
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  if (existing.farmer_id !== farmerId) {
    throw Object.assign(new Error('Not your task'), { statusCode: 403 });
  }
  const prior = (existing.status ?? '').toLowerCase().replace(/_/g, '-');
  if (prior !== 'not-started') {
    throw Object.assign(
      new Error('Only not-started tasks can be started'),
      { statusCode: 409 }
    );
  }

  await query(
    `
    UPDATE farmer_tasks SET
      status = 'in-progress',
      farmer_started_at = $1::date,
      updated_at = NOW()
    WHERE id = $2 AND farmer_id = $3
    `,
    [day, farmerTaskId, farmerId]
  );

  await notifyAgentsOfFarmerTaskStarted(farmerTaskId);

  return getFarmerTask(farmerTaskId);
}

/**
 * Farmer recalls a hierarchy submission before review.
 * Status → in-progress; photo + notes are kept for edit/resubmit.
 * 409 when not still submitted.
 */
export async function recallFarmerTask(farmerTaskId: string, farmerId: string) {
  const existing = await queryOne<{ status: string; farmer_id: string }>(
    'SELECT status, farmer_id FROM farmer_tasks WHERE id = $1',
    [farmerTaskId]
  );
  if (!existing) {
    throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  }
  if (existing.farmer_id !== farmerId) {
    throw Object.assign(new Error('Not your task'), { statusCode: 403 });
  }
  const prior = (existing.status ?? '').toLowerCase().replace(/_/g, '-');
  if (prior !== 'submitted' && prior !== 'submitted-for-approval') {
    throw Object.assign(
      new Error('Only submitted tasks can be recalled (already reviewed or not submitted)'),
      { statusCode: 409 }
    );
  }

  await query(
    `
    UPDATE farmer_tasks SET
      status = 'in-progress',
      submitted_date = NULL,
      updated_at = NOW()
    WHERE id = $1 AND farmer_id = $2
    `,
    [farmerTaskId, farmerId]
  );

  const updated = await getFarmerTask(farmerTaskId);
  await notifyAgentsOfFarmerTaskRecall(farmerTaskId);
  return updated;
}

/** Notify field agents that a farmer started a program hierarchy task. */
export async function notifyAgentsOfFarmerTaskStarted(farmerTaskId: string): Promise<void> {
  const task = (await getFarmerTask(farmerTaskId)) as {
    id?: string;
    farmer_id?: string;
    name?: string;
    farmer_name?: string;
  } | null;
  if (!task?.farmer_id || !task.id) return;

  const agentUserIds = await resolveAgentUserIdsForFarmer(task.farmer_id);
  if (agentUserIds.length === 0) return;

  const { createNotification } = await import('./notificationService');
  const farmerName = task.farmer_name ?? 'A farmer';
  const taskName = task.name ?? 'a task';

  for (const userId of agentUserIds) {
    try {
      await createNotification({
        userId,
        title: 'Farmer Started Task',
        message: `${farmerName} has started: ${taskName}`,
        type: 'success',
        contextType: 'farmer_task',
        contextId: task.id,
        actionUrl: `/tasks/${task.id}`,
        priority: 'high',
      });
    } catch {
      // best-effort
    }
  }
}

/** Notify field agents that a farmer withdrew hierarchy evidence before review. */
export async function notifyAgentsOfFarmerTaskRecall(farmerTaskId: string): Promise<void> {
  const task = (await getFarmerTask(farmerTaskId)) as {
    id?: string;
    farmer_id?: string;
    name?: string;
    farmer_name?: string;
  } | null;
  if (!task?.farmer_id || !task.id) return;

  const agentUserIds = await resolveAgentUserIdsForFarmer(task.farmer_id);
  if (agentUserIds.length === 0) return;

  const { createNotification } = await import('./notificationService');
  const farmerName = task.farmer_name ?? 'A farmer';
  const taskName = task.name ?? 'a task';

  for (const userId of agentUserIds) {
    try {
      await createNotification({
        userId,
        title: 'Task evidence recalled',
        message: `${farmerName} recalled their submission for "${taskName}". It is no longer awaiting review.`,
        type: 'task',
        contextType: 'farmer_task',
        contextId: task.id,
        priority: 'normal',
      });
    } catch {
      // best-effort
    }
  }
}

export async function approveFarmerTask(farmerTaskId: string, notes?: string) {
  const row = await queryOne<{ program_project_id: string }>(
    'SELECT program_project_id FROM farmer_tasks WHERE id = $1',
    [farmerTaskId]
  );
  await query(`
    UPDATE farmer_tasks SET status = 'approved', approved_date = NOW(),
      notes = COALESCE($1, notes), updated_at = NOW()
    WHERE id = $2
  `, [notes ?? null, farmerTaskId]);
  if (row) await refreshProjectTaskCounts(row.program_project_id);
  const updated = (await getFarmerTask(farmerTaskId)) as {
    id?: string;
    farmer_id?: string;
    name?: string;
    payment_value_kes?: number;
  } | null;
  await createPendingPaymentForApprovedTask(updated);
  await notifyFarmerOfHierarchyTaskReview(updated, 'approved');
  return updated;
}

export async function rejectFarmerTask(farmerTaskId: string, rejection_reason: string) {
  await query(`
    UPDATE farmer_tasks SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
    WHERE id = $2
  `, [rejection_reason, farmerTaskId]);
  const updated = (await getFarmerTask(farmerTaskId)) as {
    id?: string;
    farmer_id?: string;
    name?: string;
  } | null;
  await notifyFarmerOfHierarchyTaskReview(updated, 'rejected', rejection_reason);
  return updated;
}

/** In-app notification for the farmer when hierarchy evidence is approved or rejected. */
async function notifyFarmerOfHierarchyTaskReview(
  task: { id?: string; farmer_id?: string; name?: string } | null,
  outcome: 'approved' | 'rejected',
  rejectionReason?: string
): Promise<void> {
  if (!task?.id || !task.farmer_id) return;

  const farmerUserId = await resolveFarmerAppUserId(task.farmer_id);
  if (!farmerUserId) return;

  const taskName = task.name ?? 'your task';
  const title =
    outcome === 'approved'
      ? 'Task approved'
      : 'Task QC Check Failed';
  const message =
    outcome === 'approved'
      ? `Your field agent approved "${taskName}".`
      : `Your task "${taskName}" failed its quality check. Reason: ${
          rejectionReason?.trim() || 'Quality check did not pass'
        }`;

  try {
    const { createNotification } = await import('./notificationService');
    await createNotification({
      userId: farmerUserId,
      title,
      message,
      type: outcome === 'approved' ? 'task_approved' : 'task_qc_failed',
      contextType: outcome === 'approved' ? 'farmer_task' : 'task',
      contextId: task.id,
      actionUrl: `/tasks/${task.id}`,
      priority: 'high',
    });
  } catch {
    // best-effort
  }
}

async function createPendingPaymentForApprovedTask(
  task: { id?: string; farmer_id?: string; name?: string; payment_value_kes?: number } | null
): Promise<void> {
  if (!task?.id || !task.farmer_id) return;
  const amount = Math.round(Number(task.payment_value_kes ?? 0));
  if (amount <= 0) return;

  const description = `Task:${task.id}`;
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM payments WHERE description = $1',
    [description]
  );
  if (existing) return;

  await query(
    `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method)
     VALUES ($1, $2, $3, $4, 'pending', 'M-Pesa')`,
    [uuidv4(), task.farmer_id, description, amount]
  );
}

/**
 * Mark a pending payment transferred, notify farmer + field agents, and complete the linked task.
 * If the payment is already transferred, still run notify/complete so a prior sim/webhook
 * path cannot leave the farmer without a notification or the task stuck on Approved.
 */
export async function settleTransferredPayment(
  paymentId: string,
  reference: string
): Promise<boolean> {
  const row = await queryOne<{
    id: string;
    farmer_id: string;
    amount: number;
    description: string | null;
    mpesa_reference: string | null;
  }>(
    `UPDATE payments SET payment_status = 'transferred', mpesa_reference = $1, paid_at = NOW()
     WHERE id = $2 AND lower(payment_status::text) NOT IN ('transferred', 'paid')
     RETURNING id, farmer_id, amount, description, mpesa_reference`,
    [reference, paymentId]
  );
  const payment =
    row ??
    (await queryOne<{
      id: string;
      farmer_id: string;
      amount: number;
      description: string | null;
      mpesa_reference: string | null;
    }>(
      `SELECT id, farmer_id, amount, description, mpesa_reference
       FROM payments
       WHERE id = $1 AND lower(payment_status::text) IN ('transferred', 'paid')`,
      [paymentId]
    ));
  if (!payment) return false;
  try {
    await fulfillPaymentSideEffects({
      paymentId: payment.id,
      farmerId: payment.farmer_id,
      amount: Number(payment.amount ?? 0),
      description: payment.description,
      reference: reference || payment.mpesa_reference,
    });
  } catch (err) {
    console.error('[settleTransferredPayment] side effects failed', paymentId, err);
  }
  return true;
}

/**
 * After a payment is marked transferred: notify farmer + field agents, and mark the
 * linked program task completed so the farmer sees Complete instead of Approved.
 */
export async function fulfillPaymentSideEffects(input: {
  paymentId: string;
  farmerId: string;
  amount: number;
  description?: string | null;
  reference?: string | null;
  /** When false, only complete a task linked in the payment description (no amount guess). */
  allowAmountFallback?: boolean;
}): Promise<void> {
  let linked: { farmerTaskId?: string; taskName?: string } = {};
  try {
    linked = await completeFarmerTasksForTransferredPayment(input);
  } catch (err) {
    console.error('[fulfillPaymentSideEffects] complete task failed', input.paymentId, err);
  }
  const farmerUserId = await resolveFarmerAppUserId(input.farmerId);
  const farmerName =
    (
      await queryOne<{ name: string | null }>(
        'SELECT name FROM farmers WHERE farmer_id::text = $1::text',
        [input.farmerId]
      )
    )?.name?.trim() || 'A farmer';
  const taskLabel = linked.taskName ?? input.description ?? 'your task';
  const amountLabel = Math.round(input.amount).toLocaleString();
  const { createNotification } = await import('./notificationService');
  const contextId = linked.farmerTaskId ?? input.paymentId;

  try {
    if (farmerUserId) {
      const alreadyNotified = await queryOne<{ id: string }>(
        `SELECT id FROM notifications
         WHERE user_id::text = $1::text
           AND type = 'payment_processed'
           AND (
             context_id::text = $2::text
             OR context_id::text = $3::text
           )
         LIMIT 1`,
        [farmerUserId, input.paymentId, contextId]
      );
      if (!alreadyNotified) {
        await createNotification({
          userId: farmerUserId,
          title: 'Payment Processed',
          message: `KES ${amountLabel} for "${taskLabel}" has been processed.${
            input.reference ? ` Ref ${input.reference}.` : ''
          }`,
          type: 'payment_processed',
          contextType: linked.farmerTaskId ? 'farmer_task' : 'payment',
          contextId,
          actionUrl: linked.farmerTaskId ? `/tasks/${linked.farmerTaskId}` : '/payments',
          priority: 'high',
        });
      }
    } else {
      console.error(
        '[fulfillPaymentSideEffects] farmer app user not found',
        input.farmerId,
        input.paymentId
      );
    }
    for (const agentUserId of await resolveAgentUserIdsForFarmer(input.farmerId)) {
      const agentAlready = await queryOne<{ id: string }>(
        `SELECT id FROM notifications
         WHERE user_id::text = $1::text
           AND type = 'payment_processed'
           AND (
             context_id::text = $2::text
             OR context_id::text = $3::text
           )
         LIMIT 1`,
        [agentUserId, input.paymentId, contextId]
      );
      if (agentAlready) continue;
      await createNotification({
        userId: agentUserId,
        title: 'Payment Processed',
        message: `${farmerName} received KES ${amountLabel} for "${taskLabel}".`,
        type: 'payment_processed',
        contextType: linked.farmerTaskId ? 'farmer_task' : 'payment',
        contextId,
        priority: 'high',
      });
    }
  } catch (err) {
    console.error('[fulfillPaymentSideEffects] notify failed', input.paymentId, err);
  }
}

/** Repair transferred payments that never completed the task or notified the farmer. */
export async function fulfillTransferredPaymentsForFarmer(farmerId: string): Promise<void> {
  const rows = await query<{
    id: string;
    farmer_id: string;
    amount: number;
    description: string | null;
    mpesa_reference: string | null;
  }>(
    `SELECT id, farmer_id, amount, description, mpesa_reference
     FROM payments
     WHERE farmer_id::text = $1::text
       AND lower(payment_status::text) IN ('transferred', 'paid')
       AND (
         description ILIKE 'Task:%'
         OR description ILIKE 'QC:%'
       )
     ORDER BY paid_at DESC NULLS LAST, created_at DESC
     LIMIT 50`,
    [farmerId]
  );
  for (const row of rows) {
    try {
      await fulfillPaymentSideEffects({
        paymentId: row.id,
        farmerId: row.farmer_id,
        amount: Number(row.amount ?? 0),
        description: row.description,
        reference: row.mpesa_reference,
        allowAmountFallback: false,
      });
    } catch (err) {
      console.error('[fulfillTransferredPaymentsForFarmer]', row.id, err);
    }
  }
}

async function completeFarmerTasksForTransferredPayment(input: {
  paymentId: string;
  farmerId: string;
  amount: number;
  description?: string | null;
  allowAmountFallback?: boolean;
}): Promise<{ farmerTaskId?: string; taskName?: string }> {
  const description = input.description ?? '';
  const taskRef =
    /Task:([0-9a-fA-F-]{8,}|\S+)/.exec(description)?.[1] ??
    /^Task:(.+)$/.exec(description)?.[1] ??
    null;
  const qcRef =
    /QC:([0-9a-fA-F-]{8,}|\S+)/.exec(description)?.[1] ??
    /^QC:(.+)$/.exec(description)?.[1] ??
    null;

  let farmerTaskId: string | null = null;

  if (taskRef) {
    const row = await queryOne<{ id: string }>(
      `SELECT ft.id
       FROM farmer_tasks ft
       WHERE ft.farmer_id::text = $1::text
         AND (ft.id::text = $2::text OR ft.task_id::text = $2::text)
       LIMIT 1`,
      [input.farmerId, taskRef]
    );
    farmerTaskId = row?.id ?? taskRef;
  } else if (qcRef) {
    const inventory = await queryOne<{ task_id: string | null }>(
      'SELECT task_id FROM centre_inventory WHERE id::text = $1::text',
      [qcRef]
    );
    if (inventory?.task_id) {
      const row = await queryOne<{ id: string }>(
        `SELECT id FROM farmer_tasks
         WHERE farmer_id::text = $1::text AND task_id::text = $2::text
         LIMIT 1`,
        [input.farmerId, inventory.task_id]
      );
      farmerTaskId = row?.id ?? null;
    }
  }

  if (!farmerTaskId && input.allowAmountFallback !== false) {
    const matched = await queryOne<{ id: string }>(
      `
      SELECT ft.id
      FROM farmer_tasks ft
      JOIN tasks t ON t.id = ft.task_id
      WHERE ft.farmer_id::text = $1::text
        AND lower(ft.status::text) IN ('approved', 'submitted', 'in-progress', 'not-started')
        AND ABS(COALESCE(t.payment_value_kes, 0) - $2) < 1
      ORDER BY CASE lower(ft.status::text)
        WHEN 'approved' THEN 0
        WHEN 'submitted' THEN 1
        ELSE 2
      END, ft.approved_date DESC NULLS LAST
      LIMIT 1
      `,
      [input.farmerId, input.amount]
    );
    farmerTaskId = matched?.id ?? null;
  }

  if (!farmerTaskId) return {};

  const updated = await queryOne<{ id: string; name: string; program_project_id: string }>(
    `
    UPDATE farmer_tasks ft
    SET status = 'completed', updated_at = NOW()
    FROM tasks t
    WHERE ft.task_id = t.id
      AND lower(ft.status::text) <> 'completed'
      AND ft.farmer_id::text = $2::text
      AND (ft.id::text = $1::text OR ft.task_id::text = $1::text)
    RETURNING ft.id, t.name, ft.program_project_id
    `,
    [farmerTaskId, input.farmerId]
  );
  if (updated?.program_project_id) {
    await refreshProjectTaskCounts(updated.program_project_id);
  }
  const named = updated ?? (await getFarmerTask(farmerTaskId));
  return {
    farmerTaskId: updated?.id ?? farmerTaskId,
    taskName: (named as { name?: string } | null)?.name,
  };
}

export async function getHierarchyDashboardStats() {
  const projects = await queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM program_projects');
  const activeProjects = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM program_projects WHERE status = 'active'"
  );
  const totalTasks = await queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM farmer_tasks');
  const completedTasks = await queryOne<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM farmer_tasks WHERE status IN ('approved','completed')"
  );
  const pendingPayment = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(t.payment_value_kes), 0)::float AS total
    FROM farmer_tasks ft JOIN tasks t ON t.id = ft.task_id
    WHERE ft.status = 'approved'
  `);
  const centres = await queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM aggregation_centres');
  const farmers = await queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM farmers');

  return {
    total_projects: projects?.c ?? 0,
    active_projects: activeProjects?.c ?? 0,
    total_farmers: farmers?.c ?? 0,
    total_tasks: totalTasks?.c ?? 0,
    completed_tasks: completedTasks?.c ?? 0,
    pending_payment_kes: pendingPayment?.total ?? 0,
    aggregation_centres: centres?.c ?? 0,
  };
}

export async function listCentreInventory(centreId: string, status?: string) {
  let sql = `
    SELECT ci.*, f.name AS farmer_name FROM centre_inventory ci
    JOIN farmers f ON f.farmer_id = ci.farmer_id
    WHERE ci.centre_id = $1
  `;
  if (status === 'awaiting_qc') {
    sql += " AND ci.quality_status = 'pending'";
  } else if (status === 'ready_for_marketplace') {
    sql += ' AND ci.is_marketplace_ready = true';
  }
  sql += ' ORDER BY ci.received_date DESC';
  return query(sql, [centreId]);
}

export async function getCentreInventoryById(inventoryId: string) {
  return queryOne(
    `
    SELECT ci.*, f.name AS farmer_name FROM centre_inventory ci
    JOIN farmers f ON f.farmer_id = ci.farmer_id
    WHERE ci.id = $1
  `,
    [inventoryId]
  );
}

export async function receiveDelivery(data: {
  centre_id: string;
  farmer_id: string;
  task_id?: string;
  product_name: string;
  quantity_received: number;
  unit?: string;
  notes?: string;
  scanned_by_user_id?: string;
}) {
  const id = uuidv4();
  await query(`
    INSERT INTO centre_inventory (id, centre_id, farmer_id, task_id, product_name, quantity_received, unit, quality_notes, scanned_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    id, data.centre_id, data.farmer_id, data.task_id ?? null, data.product_name,
    data.quantity_received, data.unit ?? 'kg', data.notes ?? null, data.scanned_by_user_id ?? null,
  ]);
  return queryOne('SELECT * FROM centre_inventory WHERE id = $1', [id]);
}

export async function approveInventoryQuality(inventoryId: string, data: {
  quality_status: 'approved' | 'rejected';
  quality_notes?: string;
  marketplace_price_per_unit?: number;
  price_per_unit_applied?: number;
}) {
  const dbQualityStatus = data.quality_status === 'approved' ? 'passed' : 'failed';
  const marketplaceReady = data.quality_status === 'approved';
  const pricePerUnit = data.price_per_unit_applied ?? data.marketplace_price_per_unit ?? null;
  await query(`
    UPDATE centre_inventory SET quality_status = $1, quality_notes = $2,
      marketplace_price_per_unit = $3, is_marketplace_ready = $4
    WHERE id = $5
  `, [
    dbQualityStatus, data.quality_notes ?? null,
    pricePerUnit, marketplaceReady, inventoryId,
  ]);
  if (data.quality_status === 'approved') {
    await createPaymentOnQcApproval(inventoryId);
  }
  return queryOne('SELECT * FROM centre_inventory WHERE id = $1', [inventoryId]);
}

/** Create pending payment when QC passes (replaces task-approval DB trigger). */
export async function createPaymentOnQcApproval(inventoryId: string): Promise<string | null> {
  const row = await queryOne<{
    id: string;
    farmer_id: string;
    product_name: string;
    quantity_received: number;
    marketplace_price_per_unit: number | null;
    task_id: string | null;
    payment_value_kes: number | null;
    quality_status: string;
  }>(`
    SELECT ci.id, ci.farmer_id, ci.product_name, ci.quantity_received, ci.marketplace_price_per_unit,
           ci.task_id, ci.quality_status, t.payment_value_kes
    FROM centre_inventory ci
    LEFT JOIN tasks t ON t.id = ci.task_id
    WHERE ci.id = $1
  `, [inventoryId]);

  if (!row || row.quality_status !== 'passed') return null;

  const paymentDescription = `QC:${inventoryId}`;
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM payments WHERE description = $1',
    [paymentDescription]
  );
  if (existing) return existing.id;

  let amount = 0;
  if (row.marketplace_price_per_unit != null && row.quantity_received > 0) {
    amount = Math.round(row.marketplace_price_per_unit * row.quantity_received);
  } else if (row.payment_value_kes != null) {
    amount = Math.round(row.payment_value_kes);
  }
  if (amount <= 0) return null;

  const paymentId = uuidv4();
  await query(
    `INSERT INTO payments (id, farmer_id, description, amount, payment_status, payment_method)
     VALUES ($1, $2, $3, $4, 'pending', 'M-Pesa')`,
    [paymentId, row.farmer_id, paymentDescription, amount]
  );
  return paymentId;
}

export async function listPendingQcDeliveries(centreId: string) {
  return listCentreInventory(centreId, 'awaiting_qc');
}

export async function getCentreDashboard(centreId: string) {
  const total = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(quantity_received), 0)::float AS total FROM centre_inventory WHERE centre_id = $1
  `, [centreId]);
  const awaiting = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(quantity_received), 0)::float AS total FROM centre_inventory
    WHERE centre_id = $1 AND quality_status = 'pending'
  `, [centreId]);
  const ready = await queryOne<{ total: number }>(`
    SELECT COALESCE(SUM(quantity_received), 0)::float AS total FROM centre_inventory
    WHERE centre_id = $1 AND is_marketplace_ready = true
  `, [centreId]);
  const farmers = await queryOne<{ c: number }>(`
    SELECT COUNT(DISTINCT farmer_id)::int AS c FROM centre_inventory WHERE centre_id = $1
  `, [centreId]);

  return {
    total_inventory: total?.total ?? 0,
    awaiting_quality_check: awaiting?.total ?? 0,
    ready_for_marketplace: ready?.total ?? 0,
    farmers_served: farmers?.c ?? 0,
  };
}

export async function findCentreByName(name: string) {
  return queryOne('SELECT * FROM aggregation_centres WHERE name = $1', [name]);
}

export async function getFarmerPhone(farmerId: string): Promise<string | null> {
  const row = await queryOne<{ phone_number?: string }>(
    'SELECT phone_number FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  return row?.phone_number ?? null;
}

export async function getCentreName(centreId: string): Promise<string | null> {
  const row = await queryOne<{ name?: string }>(
    'SELECT name FROM aggregation_centres WHERE centre_id = $1',
    [centreId]
  );
  return row?.name ?? null;
}

export async function listPendingFarmerTasks(programProjectId?: string) {
  const sql = `
    SELECT ft.*, t.name, t.task_order, t.payment_value_kes, f.name AS farmer_name, pp.name AS program_project_name
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ft.status = 'submitted'
    ${programProjectId ? 'AND ft.program_project_id = $1' : ''}
    ORDER BY ft.submitted_date DESC
  `;
  const rows = programProjectId
    ? await query<{ status?: string }>(sql, [programProjectId])
    : await query<{ status?: string }>(sql);
  return mapFarmerTaskRows(rows);
}

export async function listAllFarmerTasks(filters?: {
  program_project_id?: string;
  status?: string;
  farmer_id?: string;
}) {
  let sql = `
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      f.name AS farmer_name, f.phone_number AS farmer_phone,
      pp.name AS program_project_name
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (filters?.program_project_id) {
    params.push(filters.program_project_id);
    sql += ` AND ft.program_project_id = $${params.length}`;
  }
  if (filters?.status) {
    params.push(toDbTaskStatus(filters.status));
    sql += ` AND ft.status = $${params.length}`;
  }
  if (filters?.farmer_id) {
    params.push(filters.farmer_id);
    sql += ` AND ft.farmer_id = $${params.length}`;
  }
  sql += ' ORDER BY pp.name, t.task_order, f.name';
  const rows = await query<{ status?: string }>(sql, params);
  return mapFarmerTaskRows(rows);
}

export async function listPendingDeliveries(centreId?: string) {
  const centreName = centreId ? await getCentreName(centreId) : null;
  let sql = `
    SELECT ft.id AS farmer_task_id, ft.farmer_id, ft.task_id, t.name AS task_name,
      f.name AS farmer_name, f.phone_number AS farmer_phone,
      pp.name AS program_project_name, ft.approved_date AS submitted_date,
      ft.submitted_date AS task_submitted_date
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ft.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM centre_inventory ci
        WHERE ci.task_id = ft.task_id AND ci.farmer_id = ft.farmer_id
      )
  `;
  const params: unknown[] = [];
  if (centreName) {
    params.push(centreName);
    sql += ` AND f.aggregation_center = $${params.length}`;
  }
  sql += ' ORDER BY ft.approved_date DESC';
  return query(sql, params);
}
