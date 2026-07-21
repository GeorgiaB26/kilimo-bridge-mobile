import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getFarmerDashboard,
  getFarmerProjects,
  getFarmerPayments,
  getFarmerNotifications,
  claimPayment,
} from '../services/farmerPortalService';
import { updateFarmerLocation } from '../services/farmerService';
import { logAudit } from '../services/auditService';
import hierarchyFarmerRoutes from './hierarchyFarmer';

const router = Router();

router.use(authenticate);
router.use(requireRole('farmer'));
router.use(hierarchyFarmerRoutes);

function logFarmerDataAccess(req: Request, resource: string, farmerId: string): void {
  logAudit({
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
  logFarmerDataAccess(req, 'dashboard', req.user.farmerId);
  res.json(data);
});

router.get('/projects', (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  logFarmerDataAccess(req, 'projects', req.user.farmerId);
  res.json({ projects: getFarmerProjects(req.user.farmerId) });
});

router.get('/payments', (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  logFarmerDataAccess(req, 'payments', req.user.farmerId);
  res.json({ payments: getFarmerPayments(req.user.farmerId) });
});

router.get('/notifications', (req: Request, res: Response) => {
  res.json({ notifications: getFarmerNotifications(req.user!.userId) });
});

router.post('/payments/:paymentId/claim', async (req: Request, res: Response) => {
  if (!req.user?.farmerId) { res.status(400).json({ error: 'No farmer profile' }); return; }
  const result = await claimPayment(req.user.farmerId, req.params.paymentId, req.user.userId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.patch('/profile/location', (req: Request, res: Response) => {
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
    updateFarmerLocation(req.user.farmerId, {
      district: district.trim(),
      subCounty: subCounty.trim(),
      parish: parish?.trim(),
      village: village?.trim(),
    });
    logFarmerDataAccess(req, 'profile', req.user.farmerId);
    const data = getFarmerDashboard(req.user.farmerId);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not update location' });
  }
});

export default router;
