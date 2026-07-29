import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { bankingRateLimiter, webhookRateLimiter } from '../middleware/security';
import {
  getBankTransactions,
  getPaymentsWithFarmers,
  processPaymentViaBanking,
  handleEquityWebhook,
} from '../services/bankingService';
import { getFinancialAuditLogs } from '../services/auditService';
import { createUser, getAllUsers } from '../services/userService';
import { logAudit } from '../services/auditService';
import { canCreateUserRole, normalizeRole } from '../../../shared/src/roles';
import type { UserRole } from '../../../shared/src/roles';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.use(authenticate);
router.use(bankingRateLimiter);

/** View payment transactions — banking roles & platform_admin */
router.get(
  '/transactions',
  requirePermission('payments.read'),
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const transactions = await getBankTransactions({ status, limit: 200 });
    res.json({ transactions });
  })
);

/** View payment processing status (minimal farmer identifiers for processing context) */
router.get(
  '/payments',
  requirePermission('payments.read'),
  asyncHandler(async (_req, res) => {
    const payments = await getPaymentsWithFarmers(200);
    res.json({ payments });
  })
);

/** Process M-Pesa payment via Equity H2H — banking_agent & platform_admin */
router.post(
  '/payments/:paymentId/process',
  requirePermission('payments.process'),
  asyncHandler(async (req, res) => {
    const result = await processPaymentViaBanking(req.params.paymentId, req.user!.userId);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  })
);

/** Financial audit trail — banking roles only */
router.get(
  '/audit',
  requirePermission('audit.read.financial'),
  asyncHandler(async (_req, res) => {
    res.json({ logs: await getFinancialAuditLogs(200) });
  })
);

/** List banking_agent accounts — banking_admin & platform_admin */
router.get(
  '/users',
  requirePermission('users.write.banking_agents'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || undefined;
    const allUsers = await getAllUsers(q);
    const users = (allUsers as Array<{ role: string }>).filter(
      (u) => normalizeRole(u.role) === 'banking_agent'
    );
    res.json({ users });
  })
);

/** Create banking_agent account — banking_admin & platform_admin */
router.post(
  '/users',
  requirePermission('users.write.banking_agents'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, name, passwordHash } = req.body;
    if (!phoneNumber || !name) {
      res.status(400).json({ error: 'phoneNumber and name are required' });
      return;
    }

    const targetRole: UserRole = 'banking_agent';
    if (!canCreateUserRole(req.user!.role, targetRole)) {
      res.status(403).json({ error: 'Cannot create banking_agent accounts' });
      return;
    }

    try {
      const userId = await createUser({ phoneNumber, name, role: targetRole, passwordHash });
      await logAudit({
        userId: req.user?.userId,
        userRole: req.user?.role,
        action: 'user.create',
        category: 'system',
        resourceType: 'user',
        resourceId: userId,
        details: { role: targetRole, name },
        success: true,
      });
      res.status(201).json({ userId });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
    }
  })
);

export default router;

/** Webhook router — mounted separately without JWT auth */
export const equityWebhookRouter = Router();
equityWebhookRouter.use(webhookRateLimiter);

equityWebhookRouter.post(
  '/equity',
  asyncHandler(async (req, res) => {
    const webhookSecret = process.env.EQUITY_WEBHOOK_SECRET;
    if (webhookSecret && req.headers['x-equity-signature'] !== webhookSecret) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const { reference, status, transactionId, message } = req.body;
    if (!reference || !status) {
      res.status(400).json({ error: 'reference and status required' });
      return;
    }

    const result = await handleEquityWebhook({ reference, status, transactionId, message });
    res.json(result);
  })
);
