import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getFarmerDashboard,
  getFarmerProjects,
  getFarmerPayments,
  claimPayment,
} from '../services/farmerPortalService';
import { getUserNotifications } from '../services/notificationService';
import { updateFarmerLocation } from '../services/farmerService';
import { logAudit } from '../services/auditService';
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
    res.json({ payments: await getFarmerPayments(req.user.farmerId) });
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

export default router;
