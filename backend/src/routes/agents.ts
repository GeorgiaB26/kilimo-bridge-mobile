import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  registerAgent,
  verifyAgent,
  getAgentsInRegion,
  getFarmersInRegion,
  createPaymentVerification,
  approvePaymentVerification,
  getAgentByUserId,
} from '../services/agentService';
import { verifyFarmerByFieldAgent } from '../services/farmerService';
import { getAgentAuditLogs } from '../services/auditService';
import { isAgentRole } from '../../../shared/src/roles';
import {
  listOpenHelpRequestsForAgent,
  resolveFarmerHelpRequest,
} from '../services/farmerHelpRequestService';

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

/** Farmers in agent's region only */
router.get(
  '/farmers',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    if (isAgentRole(req.user!.role)) {
      const region = req.user!.region ?? '';
      const district = req.user!.district;
      const farmers = await getFarmersInRegion(region, district);
      res.json({ farmers });
      return;
    }
    const region = req.query.region as string;
    const district = req.query.district as string | undefined;
    if (!region) {
      res.status(400).json({ error: 'region required' });
      return;
    }
    const farmers = await getFarmersInRegion(region, district);
    res.json({ farmers });
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
    const requests = await listOpenHelpRequestsForAgent(req.user!.userId);
    res.json({ requests });
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

export default router;
