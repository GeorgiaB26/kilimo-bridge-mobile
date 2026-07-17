import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  listFarmerProgramProjects,
  listFarmerTasks,
  getFarmerTask,
  submitFarmerTask,
} from '../services/hierarchyService';
import { sendSms } from '../services/notificationService';

const router = Router();
router.use(authenticate);

function farmerIdOr400(req: Request, res: Response): string | null {
  const farmerId = req.user?.farmerId;
  if (!farmerId) {
    res.status(400).json({ error: 'Farmer profile not linked' });
    return null;
  }
  return farmerId;
}

/** Spec aliases: GET /api/farmer/tasks?project_id=X */
router.get('/tasks', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const farmerId = farmerIdOr400(req, res);
  if (!farmerId) return;
  const project_id = (req.query.project_id ?? req.query.program_project_id) as string | undefined;
  const status = req.query.status as string | undefined;
  res.json({ tasks: listFarmerTasks(farmerId, { program_project_id: project_id, status }) });
});

router.get('/tasks/:farmerTaskId/approval-status', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
  const task = getFarmerTask(req.params.farmerTaskId) as {
    farmer_id?: string;
    status?: string;
    approved_date?: string | null;
    rejection_reason?: string | null;
    submitted_date?: string | null;
  } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  if (task.farmer_id !== req.user?.farmerId) {
    res.status(403).json({ error: 'Not your task' });
    return;
  }
  res.json({
    status: task.status,
    approval_date: task.approved_date ?? null,
    rejection_reason: task.rejection_reason ?? null,
    submitted_date: task.submitted_date ?? null,
  });
});

router.get('/tasks/:farmerTaskId', requirePermission('hierarchy.read.own'), (req: Request, res: Response) => {
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

router.post('/tasks/:farmerTaskId/submit-completion', requirePermission('tasks.submit'), (req: Request, res: Response) => {
  const task = getFarmerTask(req.params.farmerTaskId) as {
    farmer_id?: string;
    name?: string;
    farmer_phone?: string;
  } | undefined;
  if (!task || task.farmer_id !== req.user?.farmerId) {
    res.status(403).json({ error: 'Not your task' });
    return;
  }
  const { photo_url, notes } = req.body;
  const updated = submitFarmerTask(req.params.farmerTaskId, { photo_url, notes });
  if (task.farmer_phone) {
    sendSms(task.farmer_phone, `Task "${task.name}" submitted for approval. Awaiting review.`);
  }
  res.json(updated);
});

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
  const task = getFarmerTask(req.params.farmerTaskId) as {
    farmer_id?: string;
    name?: string;
    farmer_phone?: string;
  } | undefined;
  if (!task || task.farmer_id !== req.user?.farmerId) {
    res.status(403).json({ error: 'Not your task' });
    return;
  }
  const { photo_url, notes } = req.body;
  const updated = submitFarmerTask(req.params.farmerTaskId, { photo_url, notes });
  if (task.farmer_phone) {
    sendSms(task.farmer_phone, `Task "${task.name}" submitted for approval. Awaiting review.`);
  }
  res.json(updated);
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
