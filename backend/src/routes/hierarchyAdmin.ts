import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  listSectors,
  createSector,
  listPrograms,
  createProgram,
  listProgramProjects,
  createProgramProject,
  getProgramProject,
  createTask,
  assignFarmersToProject,
  approveFarmerTask,
  rejectFarmerTask,
  getFarmerTask,
  listPendingFarmerTasks,
  getHierarchyDashboardStats,
} from '../services/hierarchyService';

const router = Router();
router.use(authenticate);

router.get('/hierarchy/dashboard', requirePermission('hierarchy.read'), (_req: Request, res: Response) => {
  res.json(getHierarchyDashboardStats());
});

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

router.get('/programs', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const sectorId = req.query.sector_id as string | undefined;
  res.json({ programs: listPrograms(sectorId) });
});

router.post('/programs', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, sector_id, description } = req.body;
  if (!name || !sector_id) {
    res.status(400).json({ error: 'name and sector_id are required' });
    return;
  }
  res.status(201).json(createProgram({ name, sector_id, description }));
});

router.get('/program-projects', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const programId = req.query.program_id as string | undefined;
  res.json({ projects: listProgramProjects(programId) });
});

router.post('/program-projects', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, program_id, region, budget_kes, start_date, end_date } = req.body;
  if (!name || !program_id) {
    res.status(400).json({ error: 'name and program_id are required' });
    return;
  }
  res.status(201).json(createProgramProject({
    name, program_id, region, budget_kes, start_date, end_date,
    country_manager_id: req.user?.userId,
  }));
});

router.get('/program-projects/:projectId', requirePermission('hierarchy.read'), (req: Request, res: Response) => {
  const project = getProgramProject(req.params.projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.post('/program-projects/:projectId/tasks', requirePermission('hierarchy.write'), (req: Request, res: Response) => {
  const { name, description, task_order, payment_value_kes, due_date, assigned_agronomist_id } = req.body;
  if (!name || task_order == null) {
    res.status(400).json({ error: 'name and task_order are required' });
    return;
  }
  res.status(201).json(createTask({
    program_project_id: req.params.projectId,
    name,
    description,
    task_order: Number(task_order),
    payment_value_kes,
    due_date,
    assigned_agronomist_id,
  }));
});

router.post('/program-projects/:projectId/assign-farmers', requirePermission('hierarchy.assign'), (req: Request, res: Response) => {
  const { farmer_ids } = req.body;
  if (!Array.isArray(farmer_ids) || farmer_ids.length === 0) {
    res.status(400).json({ error: 'farmer_ids array is required' });
    return;
  }
  res.json(assignFarmersToProject(req.params.projectId, farmer_ids));
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
  res.json(approveFarmerTask(req.params.farmerTaskId, notes));
});

router.post('/farmer-tasks/:farmerTaskId/reject', requirePermission('tasks.approve'), (req: Request, res: Response) => {
  const { rejection_reason } = req.body;
  if (!rejection_reason) {
    res.status(400).json({ error: 'rejection_reason is required' });
    return;
  }
  res.json(rejectFarmerTask(req.params.farmerTaskId, rejection_reason));
});

export default router;
