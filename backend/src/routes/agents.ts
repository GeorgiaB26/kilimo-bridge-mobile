import { Router, Request, Response } from 'express';
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
import { getAgentAuditLogs } from '../services/auditService';
import { isAgentRole } from '../../../shared/src/roles';

const router = Router();

router.use(authenticate);

/** Register new aggregation centre agent with government ID */
router.post('/register', requirePermission('agents.register'), (req: Request, res: Response) => {
  const { phoneNumber, name, governmentId, aggregationCenter, region, district } = req.body;
  if (!phoneNumber || !name || !governmentId || !aggregationCenter || !region || !district) {
    res.status(400).json({ error: 'All fields required: phoneNumber, name, governmentId, aggregationCenter, region, district' });
    return;
  }
  try {
    const result = registerAgent(
      { phoneNumber, name, governmentId, aggregationCenter, region, district },
      req.user?.userId
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

/** List agents in region — agents see own region, admin sees all */
router.get('/', requirePermission('agents.read'), (req: Request, res: Response) => {
  const region = isAgentRole(req.user!.role)
    ? req.user!.region ?? req.user!.district ?? ''
    : (req.query.region as string) ?? '';

  if (!region) {
    res.status(400).json({ error: 'region query parameter required' });
    return;
  }
  res.json({ agents: getAgentsInRegion(region) });
});

/** Farmers in agent's region only */
router.get('/farmers', requirePermission('farmers.read'), (req: Request, res: Response) => {
  if (isAgentRole(req.user!.role)) {
    const region = req.user!.region ?? '';
    const district = req.user!.district;
    res.json({ farmers: getFarmersInRegion(region, district) });
    return;
  }
  const region = req.query.region as string;
  const district = req.query.district as string | undefined;
  if (!region) {
    res.status(400).json({ error: 'region required' });
    return;
  }
  res.json({ farmers: getFarmersInRegion(region, district) });
});

/** Agent's own audit log */
router.get('/audit', requirePermission('audit.read'), (req: Request, res: Response) => {
  const agentUserId = isAgentRole(req.user!.role)
    ? req.user!.userId
    : (req.query.agentUserId as string);

  if (!agentUserId) {
    res.status(400).json({ error: 'agentUserId required for admin audit view' });
    return;
  }
  res.json({ logs: getAgentAuditLogs(agentUserId) });
});

/** Verify agent (admin only) */
router.post('/:agentId/verify', requirePermission('users.write'), (req: Request, res: Response) => {
  verifyAgent(req.params.agentId, req.user!.userId);
  res.json({ success: true });
});

/** Submit payment verification */
router.post('/payments/:paymentId/verify', requirePermission('payments.verify'), (req: Request, res: Response) => {
  const id = createPaymentVerification(req.params.paymentId, req.user!.userId, req.body.notes);
  res.status(201).json({ verificationId: id });
});

/** Approve payment verification */
router.post('/verifications/:verificationId/approve', requirePermission('payments.verify'), (req: Request, res: Response) => {
  try {
    approvePaymentVerification(req.params.verificationId, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Approval failed' });
  }
});

/** Current agent profile */
router.get('/me', requirePermission('agents.read'), (req: Request, res: Response) => {
  const agent = getAgentByUserId(req.user!.userId);
  res.json({ agent });
});

export default router;
