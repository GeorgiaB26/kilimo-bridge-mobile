import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { getAuditLogs } from '../services/auditService';

const router = Router();

router.use(authenticate);
router.use(requirePermission('audit.read'));

router.get('/', (req: Request, res: Response) => {
  const logs = getAuditLogs({
    userId: req.query.userId as string | undefined,
    category: req.query.category as Parameters<typeof getAuditLogs>[0]['category'],
    action: req.query.action as Parameters<typeof getAuditLogs>[0]['action'],
    limit: parseInt(req.query.limit as string) || 100,
    offset: parseInt(req.query.offset as string) || 0,
  });
  res.json({ logs });
});

export default router;
