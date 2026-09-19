import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  registerAgent,
  verifyAgent,
  getAgentsInRegion,
  createPaymentVerification,
  approvePaymentVerification,
  getAgentByUserId,
  isFarmerVisibleToAgent,
} from '../services/agentService';
import {
  verifyFarmerByFieldAgent,
  getFarmerById,
  reviewFarmerPicture,
  listFarmers,
  countFarmers,
  farmerListScopeForViewer,
  parseFarmerListFilters,
} from '../services/farmerService';
import { getAgentAuditLogs } from '../services/auditService';
import { isAgentRole } from '../../../shared/src/roles';
import {
  listOpenHelpRequestsForAgent,
  resolveFarmerHelpRequest,
} from '../services/farmerHelpRequestService';
import {
  approveAgentTaskByAgent,
  createAgentPersonalTask,
  getAgentDashboardSummary,
  getAgentPersonalTask,
  listAgentPersonalTasks,
  listRegionFarmerTasks,
  rejectAgentTaskByAgent,
  updateAgentPersonalTask,
  updateAgentPersonalTaskReminder,
} from '../services/agentDashboardService';
import { logAudit } from '../services/auditService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.use(authenticate);

/** Register new aggregation centre agent with government ID */
router.post(
  '/register',
  requirePermission('agents.register'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, name, governmentId, aggregationCenter, region, district } = req.body;
    if (!phoneNumber || !name || !governmentId || !aggregationCenter || !region || !district) {
      res.status(400).json({
        error: 'All fields required: phoneNumber, name, governmentId, aggregationCenter, region, district',
      });
      return;
    }
    try {
      const result = await registerAgent(
        { phoneNumber, name, governmentId, aggregationCenter, region, district },
        req.user?.userId
      );
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  })
);

/** List agents in region — agents see own region, admin sees all */
router.get(
  '/',
  requirePermission('agents.read'),
  asyncHandler(async (req, res) => {
    const region = isAgentRole(req.user!.role)
      ? req.user!.region ?? req.user!.district ?? ''
      : (req.query.region as string) ?? '';

    if (!region) {
      res.status(400).json({ error: 'region query parameter required' });
      return;
    }
    const agents = await getAgentsInRegion(region);
    res.json({ agents });
  })
);

/** Farmers in agent's region only. Optional country / cooperative / project / q filters AND with that scope. */
router.get(
  '/farmers',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    const filters = parseFarmerListFilters(req.query);
    const limitRaw = parseInt(req.query.limit as string, 10);
    const offsetRaw = parseInt(req.query.offset as string, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

    let scope = farmerListScopeForViewer({
      role: req.user!.role,
      district: req.user!.district,
      region: req.user!.region,
    });
    if (!isAgentRole(req.user!.role)) {
      const region = req.query.region as string;
      const district = req.query.district as string | undefined;
      if (!region && !district) {
        res.status(400).json({ error: 'region required' });
        return;
      }
      scope = district?.trim()
        ? { kind: 'district', district: district.trim() }
        : { kind: 'agent_region', region: region.trim() };
    }

    const [farmers, total] = await Promise.all([
      listFarmers({ scope, filters, limit, offset, columns: 'agent' }),
      countFarmers({ scope, filters }),
    ]);
    res.json({ farmers, total });
  })
);

/** Full farmer profile for field agents (region-scoped) */
router.get(
  '/farmers/:farmerId',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    const visible = await isFarmerVisibleToAgent(req.params.farmerId, region, district);
    if (!visible) {
      res.status(403).json({ error: 'Farmer is outside your assigned region' });
      return;
    }
    const farmer = await getFarmerById(req.params.farmerId);
    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' });
      return;
    }
    await logAudit({
      userId: req.user!.userId,
      userRole: req.user!.role,
      action: 'farmer.read',
      category: 'farmer_data',
      resourceType: 'farmer',
      resourceId: req.params.farmerId,
      details: {
        activity_type: 'view_farmer_profile',
        farmer_name: (farmer as { name?: string }).name ?? 'Farmer',
        farmer_id: req.params.farmerId,
      },
      success: true,
    });
    res.json({ farmer });
  })
);

/** Field agent verifies farmer in person (pending_field_verification → verified/rejected). */
router.patch(
  '/farmers/:farmerId/verify-field',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    const { verification_status, verification_notes } = req.body;
    const raw = verification_status ?? (req.body.verified === false ? 'rejected' : 'verified');
    const status = raw === 'rejected' ? 'rejected' : 'verified';
    try {
      const result = await verifyFarmerByFieldAgent(
        req.params.farmerId,
        req.user!.userId,
        status,
        verification_notes ?? req.body.notes
      );
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Verification failed' });
    }
  })
);

/** Approve or reject a farmer-submitted profile photo. */
router.patch(
  '/farmers/:farmerId/photo-review',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    const visible = await isFarmerVisibleToAgent(req.params.farmerId, region, district);
    if (!visible) {
      res.status(403).json({ error: 'Farmer is outside your assigned region' });
      return;
    }
    const raw = String(req.body?.decision ?? req.body?.status ?? '').toLowerCase();
    const decision = raw === 'rejected' || raw === 'reject' ? 'rejected' : 'approved';
    try {
      const result = await reviewFarmerPicture(req.params.farmerId, req.user!.userId, decision);
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not review photo' });
    }
  })
);

/** Agent's own audit log */
router.get(
  '/audit',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const agentUserId = isAgentRole(req.user!.role)
      ? req.user!.userId
      : (req.query.agentUserId as string);

    if (!agentUserId) {
      res.status(400).json({ error: 'agentUserId required for admin audit view' });
      return;
    }
    const logs = await getAgentAuditLogs(agentUserId);
    res.json({ logs });
  })
);

/** Verify agent (admin only) */
router.post(
  '/:agentId/verify',
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    await verifyAgent(req.params.agentId, req.user!.userId);
    res.json({ success: true });
  })
);

/** Submit payment verification */
router.post(
  '/payments/:paymentId/verify',
  requirePermission('payments.verify'),
  asyncHandler(async (req, res) => {
    const id = await createPaymentVerification(req.params.paymentId, req.user!.userId, req.body.notes);
    res.status(201).json({ verificationId: id });
  })
);

/** Approve payment verification */
router.post(
  '/verifications/:verificationId/approve',
  requirePermission('payments.verify'),
  asyncHandler(async (req, res) => {
    try {
      await approvePaymentVerification(req.params.verificationId, req.user!.userId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Approval failed' });
    }
  })
);

/** Open farmer help requests assigned to this agent — shown in Tasks tab */
router.get(
  '/help-requests',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    try {
      const requests = await listOpenHelpRequestsForAgent(req.user!.userId);
      res.json({ requests });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Could not load help requests',
      });
    }
  })
);

router.post(
  '/help-requests/:requestId/resolve',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    try {
      const result = await resolveFarmerHelpRequest(req.params.requestId, req.user!.userId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not resolve request' });
    }
  })
);

/** Current agent profile */
router.get(
  '/me',
  requirePermission('agents.read'),
  asyncHandler(async (req, res) => {
    const agent = await getAgentByUserId(req.user!.userId);
    res.json({ agent });
  })
);

/** Field Agent Platform dashboard — farmer metrics + upcoming/overdue tasks */
router.get(
  '/dashboard',
  requirePermission('agents.read'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    const summary = await getAgentDashboardSummary(req.user!.userId, region, district);
    res.json(summary);
  })
);

/** All farmer program tasks + personal tasks in agent region */
router.get(
  '/tasks',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    const farmerTasks = await listRegionFarmerTasks(region, district);
    const personalTasks = await listAgentPersonalTasks(req.user!.userId);
    res.json({ farmer_tasks: farmerTasks, personal_tasks: personalTasks });
  })
);

/** Create personal task on agent profile */
router.post(
  '/tasks',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const { name, description, due_date, priority, assigned_farmers, reminder_type } = req.body;
    if (!name?.trim() || !due_date) {
      res.status(400).json({ error: 'name and due_date are required' });
      return;
    }
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    const farmerIds = Array.isArray(assigned_farmers)
      ? assigned_farmers.map(String).filter(Boolean)
      : [];
    if (farmerIds.length) {
      for (const farmerId of farmerIds) {
        const visible = await isFarmerVisibleToAgent(farmerId, region, district);
        if (!visible) {
          res.status(400).json({ error: 'One or more selected farmers are outside your region' });
          return;
        }
      }
    }
    try {
      const task = await createAgentPersonalTask(req.user!.userId, {
        name: name.trim(),
        description,
        due_date,
        priority,
        assigned_farmers: farmerIds.length ? farmerIds : undefined,
        reminder_type,
      });
      await logAudit({
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'agent.action',
        category: 'agent',
        resourceType: 'agent_task',
        resourceId: task.id,
        details: { activity_type: 'task_created', name: task.name },
        success: true,
      });
      res.status(201).json({ task });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create task';
      if (message.includes('DD-MM-YYYY') || message.includes('DD/MM/YYYY')) {
        res.status(400).json({ error: message });
        return;
      }
      throw err;
    }
  })
);

router.get(
  '/tasks/:taskId',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const task = await getAgentPersonalTask(req.params.taskId, req.user!.userId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ task });
  })
);

router.patch(
  '/tasks/:taskId',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const { status, name, description, due_date, priority } = req.body;
    try {
      const task = await updateAgentPersonalTask(req.params.taskId, req.user!.userId, {
        status,
        name,
        description,
        due_date,
        priority,
      });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      await logAudit({
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'agent.action',
        category: 'agent',
        resourceType: 'agent_task',
        resourceId: task.id,
        details: { activity_type: 'task_updated', status: task.status },
        success: true,
      });
      res.json({ task });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update task';
      if (
        message.includes('DD-MM-YYYY') ||
        message.includes('DD/MM/YYYY') ||
        message.includes('Invalid task status')
      ) {
        res.status(400).json({ error: message });
        return;
      }
      throw err;
    }
  })
);

router.post(
  '/tasks/:taskId/approve',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    try {
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
      const task = await approveAgentTaskByAgent(req.params.taskId, req.user!.userId, notes);
      await logAudit({
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'agent.action',
        category: 'agent',
        resourceType: 'agent_task',
        resourceId: task.id,
        details: { activity_type: 'task_approved' },
        success: true,
      });
      res.json({ task });
    } catch (err: unknown) {
      const statusCode =
        typeof err === 'object' && err && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      const message = err instanceof Error ? err.message : 'Could not approve task';
      if (statusCode >= 400 && statusCode < 600) {
        res.status(statusCode).json({ error: message });
        return;
      }
      throw err;
    }
  })
);

router.post(
  '/tasks/:taskId/reject',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const rejection_reason =
      typeof req.body?.rejection_reason === 'string'
        ? req.body.rejection_reason
        : typeof req.body?.reason === 'string'
          ? req.body.reason
          : '';
    try {
      const task = await rejectAgentTaskByAgent(
        req.params.taskId,
        req.user!.userId,
        rejection_reason
      );
      await logAudit({
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'agent.action',
        category: 'agent',
        resourceType: 'agent_task',
        resourceId: task.id,
        details: { activity_type: 'task_rejected' },
        success: true,
      });
      res.json({ task });
    } catch (err: unknown) {
      const statusCode =
        typeof err === 'object' && err && 'statusCode' in err
          ? Number((err as { statusCode: number }).statusCode)
          : 500;
      const message = err instanceof Error ? err.message : 'Could not reject task';
      if (statusCode >= 400 && statusCode < 600) {
        res.status(statusCode).json({ error: message });
        return;
      }
      throw err;
    }
  })
);

router.post(
  '/tasks/:taskId/reminder',
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    if (!isAgentRole(req.user!.role)) {
      res.status(403).json({ error: 'Agents only' });
      return;
    }
    const { reminder_type } = req.body;
    if (!reminder_type) {
      res.status(400).json({ error: 'reminder_type required' });
      return;
    }
    await updateAgentPersonalTaskReminder(
      req.params.taskId,
      req.user!.userId,
      reminder_type
    );
    res.json({ success: true });
  })
);

export default router;
