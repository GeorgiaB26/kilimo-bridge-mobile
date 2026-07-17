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

export function createProgram(data: { name: string; sector_id: string; description?: string }) {
  const id = uuidv4();
  db.prepare('INSERT INTO programs (id, sector_id, name, description) VALUES (?, ?, ?, ?)').run(
    id, data.sector_id, data.name, data.description ?? null
  );
  return getProgram(id);
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
      pp.name as program_project_name, f.name as farmer_name
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

export function listCentreInventory(centreId: string) {
  return db.prepare(`
    SELECT ci.*, f.name as farmer_name FROM centre_inventory ci
    JOIN farmers f ON f.farmer_id = ci.farmer_id
    WHERE ci.centre_id = ? ORDER BY ci.received_date DESC
  `).all(centreId);
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
