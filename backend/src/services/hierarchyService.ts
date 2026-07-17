import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';

function refreshProjectTaskCounts(programProjectId: string): void {
  const total = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE program_project_id = ?').get(programProjectId) as { c: number };
  const completed = db.prepare(`
    SELECT COUNT(DISTINCT ft.task_id) as c FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    WHERE t.program_project_id = ? AND ft.status IN ('approved', 'completed')
  `).get(programProjectId) as { c: number };
  db.prepare(`
    UPDATE program_projects SET total_tasks = ?, completed_tasks = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(total.c, completed.c, programProjectId);
}

export function listSectors() {
  return db.prepare('SELECT * FROM sectors ORDER BY name').all();
}

export function createSector(data: { name: string; description?: string; country?: string }) {
  const id = uuidv4();
  db.prepare('INSERT INTO sectors (id, name, description, country) VALUES (?, ?, ?, ?)').run(
    id, data.name, data.description ?? null, data.country ?? null
  );
  return db.prepare('SELECT * FROM sectors WHERE id = ?').get(id);
}

export function updateSector(id: string, data: { name?: string; description?: string; country?: string }) {
  db.prepare(`
    UPDATE sectors SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      country = COALESCE(?, country),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(data.name ?? null, data.description ?? null, data.country ?? null, id);
  return db.prepare('SELECT * FROM sectors WHERE id = ?').get(id);
}

export function deleteSector(id: string): boolean {
  const programs = db.prepare('SELECT COUNT(*) as c FROM programs WHERE sector_id = ?').get(id) as { c: number };
  if (programs.c > 0) throw new Error('Sector has programs — delete programs first');
  const result = db.prepare('DELETE FROM sectors WHERE id = ?').run(id);
  return result.changes > 0;
}

export function listPrograms(sectorId?: string) {
  if (sectorId) {
    return db.prepare(`
      SELECT p.*, s.name as sector_name FROM programs p
      JOIN sectors s ON s.id = p.sector_id
      WHERE p.sector_id = ? ORDER BY p.name
    `).all(sectorId);
  }
  return db.prepare(`
    SELECT p.*, s.name as sector_name FROM programs p
    JOIN sectors s ON s.id = p.sector_id ORDER BY s.name, p.name
  `).all();
}

export function createProgram(data: { name: string; sector_id: string; description?: string; budget_kes?: number }) {
  const id = uuidv4();
  db.prepare('INSERT INTO programs (id, sector_id, name, description, budget_kes) VALUES (?, ?, ?, ?, ?)').run(
    id, data.sector_id, data.name, data.description ?? null, data.budget_kes ?? null
  );
  return getProgram(id);
}

export function updateProgram(id: string, data: { name?: string; sector_id?: string; description?: string; budget_kes?: number }) {
  db.prepare(`
    UPDATE programs SET
      name = COALESCE(?, name),
      sector_id = COALESCE(?, sector_id),
      description = COALESCE(?, description),
      budget_kes = COALESCE(?, budget_kes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(data.name ?? null, data.sector_id ?? null, data.description ?? null, data.budget_kes ?? null, id);
  return getProgram(id);
}

export function deleteProgram(id: string): boolean {
  const projects = db.prepare('SELECT COUNT(*) as c FROM program_projects WHERE program_id = ?').get(id) as { c: number };
  if (projects.c > 0) throw new Error('Program has projects — delete projects first');
  const result = db.prepare('DELETE FROM programs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getProgram(id: string) {
  return db.prepare(`
    SELECT p.*, s.name as sector_name FROM programs p
    JOIN sectors s ON s.id = p.sector_id WHERE p.id = ?
  `).get(id);
}

export function listProgramProjects(programId?: string) {
  const sql = `
    SELECT pp.*, p.name as program_name, s.name as sector_name,
      (SELECT COUNT(*) FROM program_project_farmers pf WHERE pf.program_project_id = pp.id) as farmers_count,
      CASE WHEN pp.total_tasks > 0 THEN ROUND(100.0 * pp.completed_tasks / pp.total_tasks) ELSE 0 END as progress_percent
    FROM program_projects pp
    JOIN programs p ON p.id = pp.program_id
    JOIN sectors s ON s.id = p.sector_id
    ${programId ? 'WHERE pp.program_id = ?' : ''}
    ORDER BY pp.created_at DESC
  `;
  return programId ? db.prepare(sql).all(programId) : db.prepare(sql).all();
}

export function createProgramProject(data: {
  name: string;
  program_id: string;
  region?: string;
  budget_kes?: number;
  start_date?: string;
  end_date?: string;
  country_manager_id?: string;
}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO program_projects (id, program_id, name, region, budget_kes, start_date, end_date, country_manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.program_id, data.name, data.region ?? null, data.budget_kes ?? null,
    data.start_date ?? null, data.end_date ?? null, data.country_manager_id ?? null
  );
  return getProgramProject(id);
}

export function updateProgramProject(id: string, data: {
  name?: string;
  program_id?: string;
  region?: string;
  budget_kes?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}) {
  db.prepare(`
    UPDATE program_projects SET
      name = COALESCE(?, name),
      program_id = COALESCE(?, program_id),
      region = COALESCE(?, region),
      budget_kes = COALESCE(?, budget_kes),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name ?? null, data.program_id ?? null, data.region ?? null, data.budget_kes ?? null,
    data.start_date ?? null, data.end_date ?? null, data.status ?? null, id
  );
  return getProgramProject(id);
}

export function deleteProgramProject(id: string): boolean {
  db.prepare('DELETE FROM farmer_tasks WHERE program_project_id = ?').run(id);
  db.prepare('DELETE FROM program_project_farmers WHERE program_project_id = ?').run(id);
  db.prepare('DELETE FROM tasks WHERE program_project_id = ?').run(id);
  const result = db.prepare('DELETE FROM program_projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getProgramProject(id: string) {
  const project = db.prepare(`
    SELECT pp.*, p.name as program_name, s.name as sector_name,
      (SELECT COUNT(*) FROM program_project_farmers pf WHERE pf.program_project_id = pp.id) as farmers_count,
      CASE WHEN pp.total_tasks > 0 THEN ROUND(100.0 * pp.completed_tasks / pp.total_tasks) ELSE 0 END as progress_percent
    FROM program_projects pp
    JOIN programs p ON p.id = pp.program_id
    JOIN sectors s ON s.id = p.sector_id
    WHERE pp.id = ?
  `).get(id);
  if (!project) return null;

  const tasks = listTasks(id);
  const farmers = db.prepare(`
    SELECT f.farmer_id, f.name, f.phone_number, f.district, pf.status
    FROM program_project_farmers pf
    JOIN farmers f ON f.farmer_id = pf.farmer_id
    WHERE pf.program_project_id = ?
  `).all(id);

  return { ...project, tasks, farmers };
}

export function listTasks(programProjectId: string, filters?: { status?: string; farmer_id?: string }) {
  if (filters?.farmer_id) {
    if (filters.status) {
      return db.prepare(`
        SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
          f.name as farmer_name
        FROM farmer_tasks ft
        JOIN tasks t ON t.id = ft.task_id
        JOIN farmers f ON f.farmer_id = ft.farmer_id
        WHERE ft.program_project_id = ? AND ft.farmer_id = ? AND ft.status = ?
        ORDER BY t.task_order
      `).all(programProjectId, filters.farmer_id, filters.status);
    }
    return db.prepare(`
      SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
        f.name as farmer_name
      FROM farmer_tasks ft
      JOIN tasks t ON t.id = ft.task_id
      JOIN farmers f ON f.farmer_id = ft.farmer_id
      WHERE ft.program_project_id = ? AND ft.farmer_id = ?
      ORDER BY t.task_order
    `).all(programProjectId, filters.farmer_id);
  }

  return db.prepare(`
    SELECT t.*, (
      SELECT COUNT(*) FROM farmer_tasks ft WHERE ft.task_id = t.id AND ft.status IN ('approved','completed')
    ) as completed_count
    FROM tasks t WHERE t.program_project_id = ? ORDER BY t.task_order
  `).all(programProjectId);
}

export function createTask(data: {
  program_project_id: string;
  name: string;
  description?: string;
  task_order: number;
  payment_value_kes?: number;
  due_date?: string;
  assigned_agronomist_id?: string;
}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, program_project_id, name, description, task_order, payment_value_kes, due_date, assigned_agronomist_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.program_project_id, data.name, data.description ?? null, data.task_order,
    data.payment_value_kes ?? 0, data.due_date ?? null, data.assigned_agronomist_id ?? null
  );
  refreshProjectTaskCounts(data.program_project_id);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

export function updateTask(id: string, data: {
  name?: string;
  description?: string;
  task_order?: number;
  payment_value_kes?: number;
  due_date?: string;
}) {
  const row = db.prepare('SELECT program_project_id FROM tasks WHERE id = ?').get(id) as
    | { program_project_id: string }
    | undefined;
  if (!row) return null;
  db.prepare(`
    UPDATE tasks SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      task_order = COALESCE(?, task_order),
      payment_value_kes = COALESCE(?, payment_value_kes),
      due_date = COALESCE(?, due_date),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.name ?? null, data.description ?? null, data.task_order ?? null,
    data.payment_value_kes ?? null, data.due_date ?? null, id
  );
  refreshProjectTaskCounts(row.program_project_id);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

export function deleteTask(id: string): boolean {
  const row = db.prepare('SELECT program_project_id FROM tasks WHERE id = ?').get(id) as
    | { program_project_id: string }
    | undefined;
  if (!row) return false;
  db.prepare('DELETE FROM farmer_tasks WHERE task_id = ?').run(id);
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  refreshProjectTaskCounts(row.program_project_id);
  return result.changes > 0;
}

export function reorderTask(id: string, direction: 'up' | 'down') {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
    id: string;
    program_project_id: string;
    task_order: number;
  } | undefined;
  if (!task) return null;
  const neighbor = db.prepare(`
    SELECT * FROM tasks WHERE program_project_id = ?
      AND task_order ${direction === 'up' ? '<' : '>'} ?
    ORDER BY task_order ${direction === 'up' ? 'DESC' : 'ASC'}
    LIMIT 1
  `).get(task.program_project_id, task.task_order) as { id: string; task_order: number } | undefined;
  if (!neighbor) return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  db.prepare('UPDATE tasks SET task_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(neighbor.task_order, task.id);
  db.prepare('UPDATE tasks SET task_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(task.task_order, neighbor.id);
  return listTasks(task.program_project_id);
}

export function listProjectFarmers(programProjectId: string) {
  return db.prepare(`
    SELECT f.farmer_id, f.name, f.phone_number, pf.status, pf.created_at as assigned_date
    FROM program_project_farmers pf
    JOIN farmers f ON f.farmer_id = pf.farmer_id
    WHERE pf.program_project_id = ?
    ORDER BY pf.created_at DESC
  `).all(programProjectId);
}

export function removeFarmerFromProject(programProjectId: string, farmerId: string): boolean {
  db.prepare('DELETE FROM farmer_tasks WHERE program_project_id = ? AND farmer_id = ?').run(programProjectId, farmerId);
  const result = db.prepare('DELETE FROM program_project_farmers WHERE program_project_id = ? AND farmer_id = ?')
    .run(programProjectId, farmerId);
  return result.changes > 0;
}

export function assignFarmersToProject(programProjectId: string, farmerIds: string[]) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO program_project_farmers (id, program_project_id, farmer_id) VALUES (?, ?, ?)
  `);
  const taskRows = db.prepare('SELECT id FROM tasks WHERE program_project_id = ?').all(programProjectId) as { id: string }[];
  const insertFarmerTask = db.prepare(`
    INSERT OR IGNORE INTO farmer_tasks (id, task_id, farmer_id, program_project_id) VALUES (?, ?, ?, ?)
  `);

  let assigned = 0;
  for (const farmerId of farmerIds) {
    insert.run(uuidv4(), programProjectId, farmerId);
    for (const t of taskRows) {
      insertFarmerTask.run(uuidv4(), t.id, farmerId, programProjectId);
    }
    assigned++;
  }
  return { assigned, farmer_ids: farmerIds };
}

export function getFarmerTask(farmerTaskId: string) {
  return db.prepare(`
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      pp.name as program_project_name, f.name as farmer_name, f.phone_number as farmer_phone
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    WHERE ft.id = ?
  `).get(farmerTaskId);
}

export function listFarmerTasks(farmerId: string, filters?: { status?: string; program_project_id?: string }) {
  let sql = `
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      pp.name as program_project_name
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ft.farmer_id = ?
  `;
  const params: string[] = [farmerId];
  if (filters?.program_project_id) {
    sql += ' AND ft.program_project_id = ?';
    params.push(filters.program_project_id);
  }
  if (filters?.status) {
    sql += ' AND ft.status = ?';
    params.push(filters.status);
  }
  sql += ' ORDER BY pp.name, t.task_order';
  return db.prepare(sql).all(...params);
}

export function listFarmerProgramProjects(farmerId: string) {
  return db.prepare(`
    SELECT pp.*, p.name as program_name,
      (SELECT COUNT(*) FROM farmer_tasks ft WHERE ft.program_project_id = pp.id AND ft.farmer_id = ?) as task_count,
      (SELECT COUNT(*) FROM farmer_tasks ft WHERE ft.program_project_id = pp.id AND ft.farmer_id = ? AND ft.status IN ('approved','completed')) as completed_task_count
    FROM program_project_farmers pf
    JOIN program_projects pp ON pp.id = pf.program_project_id
    JOIN programs p ON p.id = pp.program_id
    WHERE pf.farmer_id = ?
    ORDER BY pp.name
  `).all(farmerId, farmerId, farmerId);
}

export function submitFarmerTask(farmerTaskId: string, data: { photo_url?: string; notes?: string }) {
  db.prepare(`
    UPDATE farmer_tasks SET status = 'submitted-for-approval', submitted_date = datetime('now'),
      photo_evidence_url = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(data.photo_url ?? null, data.notes ?? null, farmerTaskId);
  return getFarmerTask(farmerTaskId);
}

export function approveFarmerTask(farmerTaskId: string, notes?: string) {
  const row = db.prepare('SELECT program_project_id FROM farmer_tasks WHERE id = ?').get(farmerTaskId) as
    | { program_project_id: string } | undefined;
  db.prepare(`
    UPDATE farmer_tasks SET status = 'approved', approved_date = datetime('now'),
      notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `).run(notes ?? null, farmerTaskId);
  if (row) refreshProjectTaskCounts(row.program_project_id);
  return getFarmerTask(farmerTaskId);
}

export function rejectFarmerTask(farmerTaskId: string, rejection_reason: string) {
  db.prepare(`
    UPDATE farmer_tasks SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(rejection_reason, farmerTaskId);
  return getFarmerTask(farmerTaskId);
}

export function getHierarchyDashboardStats() {
  const projects = db.prepare('SELECT COUNT(*) as c FROM program_projects').get() as { c: number };
  const activeProjects = db.prepare("SELECT COUNT(*) as c FROM program_projects WHERE status = 'active'").get() as { c: number };
  const totalTasks = db.prepare('SELECT COUNT(*) as c FROM farmer_tasks').get() as { c: number };
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM farmer_tasks WHERE status IN ('approved','completed')").get() as { c: number };
  const pendingPayment = db.prepare(`
    SELECT COALESCE(SUM(t.payment_value_kes), 0) as total
    FROM farmer_tasks ft JOIN tasks t ON t.id = ft.task_id
    WHERE ft.status = 'approved'
  `).get() as { total: number };
  const centres = db.prepare('SELECT COUNT(*) as c FROM aggregation_centres').get() as { c: number };
  const farmers = db.prepare('SELECT COUNT(*) as c FROM farmers').get() as { c: number };

  return {
    total_projects: projects.c,
    active_projects: activeProjects.c,
    total_farmers: farmers.c,
    total_tasks: totalTasks.c,
    completed_tasks: completedTasks.c,
    pending_payment_kes: pendingPayment.total,
    aggregation_centres: centres.c,
  };
}

export function listCentreInventory(centreId: string, status?: string) {
  let sql = `
    SELECT ci.*, f.name as farmer_name FROM centre_inventory ci
    JOIN farmers f ON f.farmer_id = ci.farmer_id
    WHERE ci.centre_id = ?
  `;
  if (status === 'awaiting_qc') {
    sql += " AND ci.quality_status = 'pending'";
  } else if (status === 'ready_for_marketplace') {
    sql += ' AND ci.is_marketplace_ready = 1';
  }
  sql += ' ORDER BY ci.received_date DESC';
  return db.prepare(sql).all(centreId);
}

export function receiveDelivery(data: {
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
  db.prepare(`
    INSERT INTO centre_inventory (id, centre_id, farmer_id, task_id, product_name, quantity_received, unit, quality_notes, scanned_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.centre_id, data.farmer_id, data.task_id ?? null, data.product_name,
    data.quantity_received, data.unit ?? 'kg', data.notes ?? null, data.scanned_by_user_id ?? null
  );
  return db.prepare('SELECT * FROM centre_inventory WHERE id = ?').get(id);
}

export function approveInventoryQuality(inventoryId: string, data: {
  quality_status: 'approved' | 'rejected';
  quality_notes?: string;
  marketplace_price_per_unit?: number;
}) {
  const marketplaceReady = data.quality_status === 'approved' ? 1 : 0;
  db.prepare(`
    UPDATE centre_inventory SET quality_status = ?, quality_notes = ?,
      marketplace_price_per_unit = ?, is_marketplace_ready = ?
    WHERE id = ?
  `).run(
    data.quality_status, data.quality_notes ?? null,
    data.marketplace_price_per_unit ?? null, marketplaceReady, inventoryId
  );
  return db.prepare('SELECT * FROM centre_inventory WHERE id = ?').get(inventoryId);
}

export function getCentreDashboard(centreId: string) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(quantity_received), 0) as total FROM centre_inventory WHERE centre_id = ?
  `).get(centreId) as { total: number };
  const awaiting = db.prepare(`
    SELECT COALESCE(SUM(quantity_received), 0) as total FROM centre_inventory
    WHERE centre_id = ? AND quality_status = 'pending'
  `).get(centreId) as { total: number };
  const ready = db.prepare(`
    SELECT COALESCE(SUM(quantity_received), 0) as total FROM centre_inventory
    WHERE centre_id = ? AND is_marketplace_ready = 1
  `).get(centreId) as { total: number };
  const farmers = db.prepare(`
    SELECT COUNT(DISTINCT farmer_id) as c FROM centre_inventory WHERE centre_id = ?
  `).get(centreId) as { c: number };

  return {
    total_inventory: total.total,
    awaiting_quality_check: awaiting.total,
    ready_for_marketplace: ready.total,
    farmers_served: farmers.c,
  };
}

export function findCentreByName(name: string) {
  return db.prepare('SELECT * FROM aggregation_centres WHERE name = ?').get(name);
}

export function getFarmerPhone(farmerId: string): string | null {
  const row = db.prepare('SELECT phone_number FROM farmers WHERE farmer_id = ?').get(farmerId) as
    | { phone_number?: string }
    | undefined;
  return row?.phone_number ?? null;
}

export function getCentreName(centreId: string): string | null {
  const row = db.prepare('SELECT name FROM aggregation_centres WHERE centre_id = ?').get(centreId) as
    | { name?: string }
    | undefined;
  return row?.name ?? null;
}

export function listPendingFarmerTasks(programProjectId?: string) {
  const sql = `
    SELECT ft.*, t.name, t.task_order, t.payment_value_kes, f.name as farmer_name, pp.name as program_project_name
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE ft.status = 'submitted-for-approval'
    ${programProjectId ? 'AND ft.program_project_id = ?' : ''}
    ORDER BY ft.submitted_date DESC
  `;
  return programProjectId ? db.prepare(sql).all(programProjectId) : db.prepare(sql).all();
}

export function listAllFarmerTasks(filters?: {
  program_project_id?: string;
  status?: string;
  farmer_id?: string;
}) {
  let sql = `
    SELECT ft.*, t.name, t.description, t.task_order, t.payment_value_kes, t.due_date,
      f.name as farmer_name, f.phone_number as farmer_phone,
      pp.name as program_project_name
    FROM farmer_tasks ft
    JOIN tasks t ON t.id = ft.task_id
    JOIN farmers f ON f.farmer_id = ft.farmer_id
    JOIN program_projects pp ON pp.id = ft.program_project_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (filters?.program_project_id) {
    sql += ' AND ft.program_project_id = ?';
    params.push(filters.program_project_id);
  }
  if (filters?.status) {
    sql += ' AND ft.status = ?';
    params.push(filters.status);
  }
  if (filters?.farmer_id) {
    sql += ' AND ft.farmer_id = ?';
    params.push(filters.farmer_id);
  }
  sql += ' ORDER BY pp.name, t.task_order, f.name';
  return db.prepare(sql).all(...params);
}

export function listPendingDeliveries(centreId?: string) {
  const centreName = centreId ? getCentreName(centreId) : null;
  let sql = `
    SELECT ft.id as farmer_task_id, ft.farmer_id, ft.task_id, t.name as task_name,
      f.name as farmer_name, f.phone_number as farmer_phone,
      pp.name as program_project_name, ft.approved_date as submitted_date,
      ft.submitted_date as task_submitted_date
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
  const params: string[] = [];
  if (centreName) {
    sql += ' AND f.aggregation_center = ?';
    params.push(centreName);
  }
  sql += ' ORDER BY ft.approved_date DESC';
  return params.length ? db.prepare(sql).all(...params) : db.prepare(sql).all();
}
