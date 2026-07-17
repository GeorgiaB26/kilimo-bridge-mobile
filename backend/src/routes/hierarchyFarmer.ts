import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  listFarmerProgramProjects,
  listFarmerTasks,
  getFarmerTask,
  submitFarmerTask,
} from '../services/hierarchyService';

const router = Router();
router.use(authenticate);

router.get('/hierarchy/projects', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const farmerId = req.user?.farmerId;
  if (!farmerId) {
    res.status(400).json({ error: 'Farmer profile not linked' });
    return;
  }
  res.json({ projects: listFarmerProgramProjects(farmerId) });
});

router.get('/hierarchy/tasks', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const farmerId = req.user?.farmerId;
  if (!farmerId) {
    res.status(400).json({ error: 'Farmer profile not linked' });
    return;
  }
  const status = req.query.status as string | undefined;
  const program_project_id = req.query.program_project_id as string | undefined;
  res.json({ tasks: listFarmerTasks(farmerId, { status, program_project_id }) });
});

router.get('/hierarchy/tasks/:farmerTaskId', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const task = getFarmerTask(req.params.farmerTaskId) as { farmer_id?: string } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  if (task.farmer_id !== req.user?.farmerId) {
    res.status(403).json({ error: 'Not your task' });
    return;
  }
  res.json(task);
});

router.post('/hierarchy/tasks/:farmerTaskId/submit', requirePermission('tasks.submit'), (req: Request, res: Response) => {
  const task = getFarmerTask(req.params.farmerTaskId) as { farmer_id?: string } | undefined;
  if (!task || task.farmer_id !== req.user?.farmerId) {
    res.status(403).json({ error: 'Not your task' });
    return;
  }
  const { photo_url, notes } = req.body;
  res.json(submitFarmerTask(req.params.farmerTaskId, { photo_url, notes }));
});

router.get('/hierarchy/payment-pending', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const farmerId = req.user?.farmerId;
  if (!farmerId) {
    res.status(400).json({ error: 'Farmer profile not linked' });
    return;
  }
  const tasks = listFarmerTasks(farmerId, { status: 'approved' });
  const total = (tasks as { payment_value_kes?: number }[]).reduce((s, t) => s + (t.payment_value_kes ?? 0), 0);
  const pending = listFarmerTasks(farmerId, { status: 'submitted-for-approval' });
  res.json({ total_pending_kes: total, tasks_pending_approval: pending.length });
});

export default router;
