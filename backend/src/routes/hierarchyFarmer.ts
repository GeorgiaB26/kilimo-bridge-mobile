import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  listFarmerProgramProjects,
  listFarmerTasks,
  getFarmerTask,
  submitFarmerTask,
} from '../services/hierarchyService';
import { getAdminNotifyPhone, sendSms } from '../services/notificationService';

const router = Router();
router.use(authenticate);

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function farmerIdOr400(req: Request, res: Response): string | null {
  const farmerId = req.user?.farmerId;
  if (!farmerId) {
    res.status(400).json({ error: 'Farmer profile not linked' });
    return null;
  }
  return farmerId;
}

function mapFarmerTaskRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    payment: row.payment_value_kes,
    payment_value_kes: row.payment_value_kes,
    status: row.status,
    due_date: row.due_date,
    description: row.description,
    sequence_order: row.task_order,
    task_order: row.task_order,
    photo_url: row.photo_evidence_url,
    notes: row.notes,
    approval_date: row.approved_date,
    rejection_reason: row.rejection_reason,
  };
}

/** Spec aliases: GET /api/farmer/tasks?project_id=X */
router.get(
  '/tasks',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const farmerId = farmerIdOr400(req, res);
    if (!farmerId) return;
    const project_id = (req.query.project_id ?? req.query.program_project_id) as string | undefined;
    const status = req.query.status as string | undefined;
    const rows = (await listFarmerTasks(farmerId, { program_project_id: project_id, status })) as Record<
      string,
      unknown
    >[];
    res.json({ tasks: rows.map(mapFarmerTaskRow) });
  })
);

router.get(
  '/tasks/:farmerTaskId/approval-status',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as {
      farmer_id?: string;
      status?: string;
      approved_date?: string | null;
      rejection_reason?: string | null;
      submitted_date?: string | null;
    } | null;
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
  })
);

/** Spec alias: GET /api/farmer/tasks/:task_id/status */
router.get(
  '/tasks/:farmerTaskId/status',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as {
      farmer_id?: string;
      status?: string;
      approved_date?: string | null;
      rejection_reason?: string | null;
      submitted_date?: string | null;
    } | null;
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
  })
);

router.get(
  '/tasks/:farmerTaskId',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as { farmer_id?: string } | null;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (task.farmer_id !== req.user?.farmerId) {
      res.status(403).json({ error: 'Not your task' });
      return;
    }
    res.json(mapFarmerTaskRow(task as Record<string, unknown>));
  })
);

router.post(
  '/tasks/:farmerTaskId/submit-completion',
  requirePermission('tasks.submit'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as {
      farmer_id?: string;
      name?: string;
      farmer_phone?: string;
    } | null;
    if (!task || task.farmer_id !== req.user?.farmerId) {
      res.status(403).json({ error: 'Not your task' });
      return;
    }
    const { photo_url, notes } = req.body;
    const updated = await submitFarmerTask(req.params.farmerTaskId, { photo_url, notes });
    if (task.farmer_phone) {
      sendSms(task.farmer_phone, `Task "${task.name}" submitted for approval. Awaiting review.`);
    }
    const adminPhone = await getAdminNotifyPhone();
    if (adminPhone) {
      sendSms(adminPhone, `Farmer submitted task "${task.name}" for approval. Review in Kilimo Bridge admin.`);
    }
    res.json({
      status: 'submitted',
      message: 'Task submitted for approval',
      task: mapFarmerTaskRow(updated as Record<string, unknown>),
    });
  })
);

router.get(
  '/hierarchy/projects',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const farmerId = req.user?.farmerId;
    if (!farmerId) {
      res.status(400).json({ error: 'Farmer profile not linked' });
      return;
    }
    res.json({ projects: await listFarmerProgramProjects(farmerId) });
  })
);

router.get(
  '/hierarchy/tasks',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const farmerId = req.user?.farmerId;
    if (!farmerId) {
      res.status(400).json({ error: 'Farmer profile not linked' });
      return;
    }
    const status = req.query.status as string | undefined;
    const program_project_id = req.query.program_project_id as string | undefined;
    res.json({ tasks: await listFarmerTasks(farmerId, { status, program_project_id }) });
  })
);

router.get(
  '/hierarchy/tasks/:farmerTaskId',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as { farmer_id?: string } | null;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (task.farmer_id !== req.user?.farmerId) {
      res.status(403).json({ error: 'Not your task' });
      return;
    }
    res.json(task);
  })
);

router.post(
  '/hierarchy/tasks/:farmerTaskId/submit',
  requirePermission('tasks.submit'),
  asyncHandler(async (req, res) => {
    const task = (await getFarmerTask(req.params.farmerTaskId)) as {
      farmer_id?: string;
      name?: string;
      farmer_phone?: string;
    } | null;
    if (!task || task.farmer_id !== req.user?.farmerId) {
      res.status(403).json({ error: 'Not your task' });
      return;
    }
    const { photo_url, notes } = req.body;
    const updated = await submitFarmerTask(req.params.farmerTaskId, { photo_url, notes });
    if (task.farmer_phone) {
      sendSms(task.farmer_phone, `Task "${task.name}" submitted for approval. Awaiting review.`);
    }
    const adminPhone = await getAdminNotifyPhone();
    if (adminPhone) {
      sendSms(adminPhone, `Farmer submitted task "${task.name}" for approval. Review in Kilimo Bridge admin.`);
    }
    res.json(updated);
  })
);

router.get(
  '/hierarchy/payment-pending',
  requirePermission('hierarchy.read.own'),
  asyncHandler(async (req, res) => {
    const farmerId = req.user?.farmerId;
    if (!farmerId) {
      res.status(400).json({ error: 'Farmer profile not linked' });
      return;
    }
    const tasks = (await listFarmerTasks(farmerId, { status: 'approved' })) as { payment_value_kes?: number }[];
    const total = tasks.reduce((s, t) => s + (t.payment_value_kes ?? 0), 0);
    const pending = await listFarmerTasks(farmerId, { status: 'submitted-for-approval' });
    res.json({ total_pending_kes: total, tasks_pending_approval: pending.length });
  })
);

export default router;
