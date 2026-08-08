import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getFarmerDashboard,
  getFarmerProjects,
  getFarmerPayments,
  getFarmerPaymentSummary,
  claimPayment,
  listAllFarmerAssignedTasks,
} from '../services/farmerPortalService';
import { getUserNotifications } from '../services/notificationService';
import { updateFarmerLocation, updateFarmerPicture } from '../services/farmerService';
import { logAudit } from '../services/auditService';
import { createFarmerHelpRequest } from '../services/farmerHelpRequestService';
import { createFarmerPersonalTask } from '../services/agentDashboardService';
import hierarchyFarmerRoutes from './hierarchyFarmer';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.use(authenticate);
router.use(requireRole('farmer'));
router.use(hierarchyFarmerRoutes);

function logFarmerDataAccess(req: Request, resource: string, farmerId: string): void {
  void logAudit({
    userId: req.user?.userId,
    userRole: req.user?.role,
    action: 'data.access',
    category: 'farmer_data',
    resourceType: resource,
    resourceId: farmerId,
    ipAddress: req.ip,
    success: true,
  });
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile linked to this account' });
      return;
    }
    const data = await getFarmerDashboard(req.user.farmerId);
    if (!data) {
      res.status(404).json({ error: 'Farmer profile not found' });
      return;
    }
    logFarmerDataAccess(req, 'dashboard', req.user.farmerId);
    res.json(data);
  })
);

/** All tasks assigned to this farmer (program + field agent assignments). */
router.get(
  '/assigned-tasks',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile linked to this account' });
      return;
    }
    const status = req.query.status as string | undefined;
    const outstanding =
      req.query.outstanding === 'true' || req.query.outstanding === '1';
    const tasks = await listAllFarmerAssignedTasks(req.user.farmerId, {
      status,
      outstanding,
    });
    logFarmerDataAccess(req, 'assigned_tasks', req.user.farmerId);
    res.json({ tasks, count: tasks.length });
  })
);

router.get(
  '/projects',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    logFarmerDataAccess(req, 'projects', req.user.farmerId);
    res.json({ projects: await getFarmerProjects(req.user.farmerId) });
  })
);

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    logFarmerDataAccess(req, 'payments', req.user.farmerId);
    const payments = await getFarmerPayments(req.user.farmerId);
    const summary = await getFarmerPaymentSummary(req.user.farmerId);
    res.json({ payments, summary });
  })
);

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    res.json({ notifications: await getUserNotifications(req.user!.userId) });
  })
);

router.post(
  '/payments/:paymentId/claim',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    const result = await claimPayment(req.user.farmerId, req.params.paymentId, req.user.userId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  })
);

router.patch(
  '/profile/location',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    const { district, subCounty, parish, village } = req.body as {
      district?: string;
      subCounty?: string;
      parish?: string;
      village?: string;
    };
    if (!district?.trim() || !subCounty?.trim()) {
      res.status(400).json({ error: 'District and sub-county are required' });
      return;
    }
    try {
      await updateFarmerLocation(req.user.farmerId, {
        district: district.trim(),
        subCounty: subCounty.trim(),
        parish: parish?.trim(),
        village: village?.trim(),
      });
      logFarmerDataAccess(req, 'profile', req.user.farmerId);
      const data = await getFarmerDashboard(req.user.farmerId);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update location' });
    }
  })
);

router.patch(
  '/profile/photo',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    const picture_url =
      typeof req.body?.picture_url === 'string' ? req.body.picture_url.trim() : '';
    if (!picture_url) {
      res.status(400).json({ error: 'picture_url is required' });
      return;
    }
    try {
      await updateFarmerPicture(req.user.farmerId, picture_url);
      logFarmerDataAccess(req, 'profile', req.user.farmerId);
      const data = await getFarmerDashboard(req.user.farmerId);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update photo' });
    }
  })
);

router.post(
  '/personal-tasks',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId || !req.user?.userId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    const { name, description, due_date, priority, assign_to_self } = req.body as {
      name?: string;
      description?: string;
      due_date?: string;
      priority?: string;
      assign_to_self?: boolean;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Task title is required' });
      return;
    }
    if (!due_date?.trim()) {
      res.status(400).json({ error: 'Due date is required (DD/MM/YYYY)' });
      return;
    }
    try {
      const task = await createFarmerPersonalTask(req.user.farmerId, req.user.userId, {
        name: name.trim(),
        description,
        due_date: due_date.trim(),
        priority,
        assign_to_self,
      });
      logFarmerDataAccess(req, 'personal_task', req.user.farmerId);
      res.status(201).json({ task });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not create task',
      });
    }
  })
);

router.post(
  '/help-requests',
  asyncHandler(async (req, res) => {
    if (!req.user?.farmerId) {
      res.status(400).json({ error: 'No farmer profile' });
      return;
    }
    const { message } = req.body as { message?: string };
    try {
      const result = await createFarmerHelpRequest(req.user.farmerId, message ?? '');
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not send message' });
    }
  })
);

export default router;
