import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { getAuditLogs } from '../services/auditService';

const router = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.use(authenticate);
router.use(requirePermission('audit.read'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const logs = await getAuditLogs({
      userId: req.query.userId as string | undefined,
      category: req.query.category as Parameters<typeof getAuditLogs>[0]['category'],
      action: req.query.action as Parameters<typeof getAuditLogs>[0]['action'],
      limit: parseInt(req.query.limit as string) || 100,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json({ logs });
  })
);

export default router;
