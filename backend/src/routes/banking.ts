import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { bankingRateLimiter, webhookRateLimiter } from '../middleware/security';
import {
  getBankTransactions,
  processPaymentViaBanking,
  handleEquityWebhook,
} from '../services/bankingService';
import { getFinancialAuditLogs } from '../services/auditService';
import { db } from '../db/database';

const router = Router();

router.use(authenticate);
router.use(bankingRateLimiter);

/** View all payment transactions — banking & admin only */
router.get('/transactions', requirePermission('payments.read'), (_req: Request, res: Response) => {
  const status = _req.query.status as string | undefined;
  const transactions = getBankTransactions({ status, limit: 200 });
  res.json({ transactions });
});

/** View all farmer payments with status */
router.get('/payments', requirePermission('payments.read'), (_req: Request, res: Response) => {
  const payments = db.prepare(`
    SELECT p.*, f.name as farmer_name, f.phone_number, f.district
    FROM payments p
    JOIN farmers f ON p.farmer_id = f.farmer_id
    ORDER BY p.created_at DESC LIMIT 200
  `).all();
  res.json({ payments });
});

/** Process M-Pesa payment via Equity H2H */
router.post('/payments/:paymentId/process', requirePermission('payments.process'), async (req: Request, res: Response) => {
  const result = await processPaymentViaBanking(req.params.paymentId, req.user!.userId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

/** Financial audit trail */
router.get('/audit', requirePermission('audit.read'), (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  if (category === 'financial' || req.user?.role === 'banking') {
    res.json({ logs: getFinancialAuditLogs(200) });
    return;
  }
  res.json({ logs: getFinancialAuditLogs(100) });
});

export default router;

/** Webhook router — mounted separately without JWT auth */
export const equityWebhookRouter = Router();
equityWebhookRouter.use(webhookRateLimiter);

equityWebhookRouter.post('/equity', (req: Request, res: Response) => {
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

  const result = handleEquityWebhook({ reference, status, transactionId, message });
  res.json(result);
});
