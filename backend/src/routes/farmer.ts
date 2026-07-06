import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getFarmerDashboard,
  getFarmerProjects,
  getFarmerPayments,
  getFarmerNotifications,
  claimPayment,
} from '../services/farmerPortalService';

const router = Router();

router.use(authenticate);
router.use(requireRole('farmer'));

router.get('/dashboard', (req: Request, res: Response) => {
  if (!req.user?.farmerId) {
    res.status(400).json({ error: 'No farmer profile linked to this account' });
    return;
  }
  const data = getFarmerDashboard(req.user.farmerId);
  if (!data) {
    res.status(404).json({ error: 'Farmer profile not found' });
    return;
  }
  res.json(data);
});

router.get('/projects', (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  res.json({ projects: getFarmerProjects(req.user.farmerId) });
});

router.get('/payments', (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  res.json({ payments: getFarmerPayments(req.user.farmerId) });
});

router.get('/notifications', (req: Request, res: Response) => {
  res.json({ notifications: getFarmerNotifications(req.user!.userId) });
});

router.post('/payments/:paymentId/claim', (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  const result = claimPayment(req.user.farmerId, req.params.paymentId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

export default router;
