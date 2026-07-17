import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  listSectors,
  createSector,
  updateSector,
  deleteSector,
  listPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  listProgramProjects,
  createProgramProject,
  updateProgramProject,
  deleteProgramProject,
  getProgramProject,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTask,
  listProjectFarmers,
  assignFarmersToProject,
  removeFarmerFromProject,
  approveFarmerTask,
  rejectFarmerTask,
  getFarmerTask,
  listPendingFarmerTasks,
  listAllFarmerTasks,
  getHierarchyDashboardStats,
} from '../services/hierarchyService';
import { sendSms } from '../services/notificationService';

const router = Router();
router.use(authenticate);

function handleError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'Request failed';
  res.status(400).json({ error: message });
}

router.get('/hierarchy/dashboard', requirePermission('hierarchy.read'), (_req: Request, res: Response) => {
  res.json(getHierarchyDashboardStats());
});

// ── Sectors ──────────────────────────────────────────────────────────────────

router.get('/sectors', requirePermission('hierarchy.read'), (_req: Request, res: Response) => {
  res.json({ sectors: listSectors() });
});

router.post('/sectors', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, description, country } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  res.status(201).json(createSector({ name, description, country }));
});

router.put('/sectors/:id', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, description, country } = req.body;
  const sector = updateSector(req.params.id, { name, description, country });
  if (!sector) {
    res.status(404).json({ error: 'Sector not found' });
    return;
  }
  res.json(sector);
});

router.delete('/sectors/:id', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  try {
    if (!deleteSector(req.params.id)) {
      res.status(404).json({ error: 'Sector not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err: unknown) {
    handleError(res, err);
  }
});

// ── Programs ─────────────────────────────────────────────────────────────────

router.get('/programs', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const sectorId = req.query.sector_id as string | undefined;
  res.json({ programs: listPrograms(sectorId) });
});

router.post('/programs', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, sector_id, description, budget_kes, budget } = req.body;
  if (!name || !sector_id) {
    res.status(400).json({ error: 'name and sector_id are required' });
    return;
  }
  res.status(201).json(createProgram({
    name, sector_id, description, budget_kes: budget_kes ?? budget,
  }));
});

router.put('/programs/:id', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, sector_id, description, budget_kes, budget } = req.body;
  const program = updateProgram(req.params.id, {
    name, sector_id, description, budget_kes: budget_kes ?? budget,
  });
  if (!program) {
    res.status(404).json({ error: 'Program not found' });
    return;
  }
  res.json(program);
});

router.delete('/programs/:id', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  try {
    if (!deleteProgram(req.params.id)) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err: unknown) {
    handleError(res, err);
  }
});

// ── Projects (program_projects + spec aliases) ───────────────────────────────

function listProjectsHandler(req: Request, res: Response): void {
  const programId = (req.query.program_id ?? req.query.programId) as string | undefined;
  res.json({ projects: listProgramProjects(programId) });
}

router.get('/program-projects', requirePermission('hierarchy.read'), listProjectsHandler);
router.get('/projects', requirePermission('hierarchy.read'), listProjectsHandler);

function createProjectHandler(req: Request, res: Response): void {
  const { name, program_id, region, budget_kes, budget, start_date, end_date, due_date } = req.body;
  if (!name || !program_id) {
    res.status(400).json({ error: 'name and program_id are required' });
    return;
  }
  res.status(201).json(createProgramProject({
    name,
    program_id,
    region,
    budget_kes: budget_kes ?? budget,
    start_date,
    end_date: end_date ?? due_date,
    country_manager_id: req.user?.userId,
  }));
}

router.post('/program-projects', requirePermission('hierarchy.write'), createProjectHandler);
router.post('/projects', requirePermission('hierarchy.write'), createProjectHandler);

router.get('/program-projects/:projectId', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const project = getProgramProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.get('/projects/:projectId', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const project = getProgramProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

function updateProjectHandler(req: Request, res: Response): void {
  const { name, program_id, region, budget_kes, budget, start_date, end_date, due_date, status } = req.body;
  const project = updateProgramProject(req.params.projectId, {
    name, program_id, region, budget_kes: budget_kes ?? budget,
    start_date, end_date: end_date ?? due_date, status,
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
}

router.put('/program-projects/:projectId', requirePermission('hierarchy.write'), updateProjectHandler);
router.put('/projects/:projectId', requirePermission('hierarchy.write'), updateProjectHandler);

function deleteProjectHandler(req: Request, res: Response): void {
  if (!deleteProgramProject(req.params.projectId)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ deleted: true });
}

router.delete('/program-projects/:projectId', requirePermission('hierarchy.write'), deleteProjectHandler);
router.delete('/projects/:projectId', requirePermission('hierarchy.write'), deleteProjectHandler);

// ── Task templates ───────────────────────────────────────────────────────────

router.get('/program-projects/:projectId/tasks', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  res.json({ tasks: listTasks(req.params.projectId) });
});

router.get('/projects/:projectId/tasks', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  res.json({ tasks: listTasks(req.params.projectId) });
});

function createTaskHandler(req: Request, res: Response): void {
  const { name, description, task_order, sequence_order, payment_value_kes, payment, due_date, assigned_agronomist_id } = req.body;
  const order = task_order ?? sequence_order;
  if (!name || order == null) {
    res.status(400).json({ error: 'name and task_order are required' });
    return;
  }
  res.status(201).json(createTask({
    program_project_id: req.params.projectId,
    name,
    description,
    task_order: Number(order),
    payment_value_kes: payment_value_kes ?? payment,
    due_date,
    assigned_agronomist_id,
  }));
}

router.post('/program-projects/:projectId/tasks', requirePermission('hierarchy.write'), createTaskHandler);
router.post('/projects/:projectId/tasks', requirePermission('hierarchy.write'), createTaskHandler);

router.put('/tasks/:taskId', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, description, task_order, sequence_order, payment_value_kes, payment, due_date } = req.body;
  const task = updateTask(req.params.taskId, {
    name,
    description,
    task_order: task_order ?? sequence_order,
    payment_value_kes: payment_value_kes ?? payment,
    due_date,
  });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

router.delete('/tasks/:taskId', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  if (!deleteTask(req.params.taskId)) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ deleted: true });
});

router.post('/tasks/:taskId/reorder', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const direction = req.body.direction as 'up' | 'down';
  if (!['up', 'down'].includes(direction)) {
    res.status(400).json({ error: 'direction must be up or down' });
    return;
  }
  const tasks = reorderTask(req.params.taskId, direction);
  res.json({ tasks });
});

// ── Assign farmers ───────────────────────────────────────────────────────────

router.get('/program-projects/:projectId/farmers', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  res.json({ farmers: listProjectFarmers(req.params.projectId) });
});

router.get('/projects/:projectId/farmers', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  res.json({ farmers: listProjectFarmers(req.params.projectId) });
});

function assignFarmersHandler(req: Request, res: Response): void {
  const farmer_ids = req.body.farmer_ids ?? (req.body.farmer_id ? [req.body.farmer_id] : []);
  if (!Array.isArray(farmer_ids) || farmer_ids.length === 0) {
    res.status(400).json({ error: 'farmer_ids array is required' });
    return;
  }
  res.json(assignFarmersToProject(req.params.projectId, farmer_ids));
}

router.post('/program-projects/:projectId/assign-farmers', requirePermission('hierarchy.assign'), assignFarmersHandler);
router.post('/projects/:projectId/farmers', requirePermission('hierarchy.assign'), assignFarmersHandler);

router.delete('/program-projects/:projectId/farmers/:farmerId', requirePermission('hierarchy.assign'), (req: Request, res: Response) => {
  if (!removeFarmerFromProject(req.params.projectId, req.params.farmerId)) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }
  res.json({ removed: true });
});

router.delete('/projects/:projectId/farmers/:farmerId', requirePermission('hierarchy.assign'), (req: Request, res: Response) => {
  if (!removeFarmerFromProject(req.params.projectId, req.params.farmerId)) {
    res.status(404).json({ error: 'Assignment not found' });
    return;
  }
  res.json({ removed: true });
});

// ── Farmer task approvals ────────────────────────────────────────────────────

router.get('/farmer-tasks', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const program_project_id = req.query.program_project_id as string | undefined;
  const status = req.query.status as string | undefined;
  const farmer_id = req.query.farmer_id as string | undefined;
  res.json({ tasks: listAllFarmerTasks({ program_project_id, status, farmer_id }) });
});

router.get('/farmer-tasks/pending', requirePermission('tasks.approve'), (req: Request, res: Response) => {
  const projectId = req.query.program_project_id as string | undefined;
  res.json({ tasks: listPendingFarmerTasks(projectId) });
});

router.get('/farmer-tasks/:farmerTaskId', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const task = getFarmerTask(req.params.farmerTaskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

router.post('/farmer-tasks/:farmerTaskId/approve', requirePermission('tasks.approve'), (req: Request, res: Response) => {
  const { notes } = req.body;
  const task = approveFarmerTask(req.params.farmerTaskId, notes) as {
    name?: string;
    payment_value_kes?: number;
    farmer_phone?: string;
  };
  if (task?.farmer_phone) {
    sendSms(
      task.farmer_phone,
      `Task "${task.name}" approved! ${task.payment_value_kes ?? 0} KES pending settlement. Thank you!`
    );
  }
  res.json(task);
});

router.post('/farmer-tasks/:farmerTaskId/reject', requirePermission('tasks.approve'), (req: Request, res: Response) => {
  const { rejection_reason } = req.body;
  if (!rejection_reason) {
    res.status(400).json({ error: 'rejection_reason is required' });
    return;
  }
  const task = rejectFarmerTask(req.params.farmerTaskId, rejection_reason) as {
    name?: string;
    farmer_phone?: string;
  };
  if (task?.farmer_phone) {
    sendSms(task.farmer_phone, `Task "${task.name}" rejected. Reason: ${rejection_reason}. Please resubmit.`);
  }
  res.json(task);
});

export default router;
