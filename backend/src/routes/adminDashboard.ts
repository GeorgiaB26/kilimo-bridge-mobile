import { Router, Request, Response } from 'express';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import { getAllUsers, getAdminStats, createUser } from '../services/userService';
import { getAllFarmers, getFarmerCount, getFarmerCountByCountry, getFarmerById } from '../services/farmerService';
import { getCentreCountByCountry } from '../services/aggregationCentreService';
import { logAudit } from '../services/auditService';
import { isAgentRole } from '../../../shared/src/roles';
import type { UserRole } from '../../../shared/src/roles';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'admin', 'agent'));

router.get('/dashboard', requirePermission('reports.read'), (_req: Request, res: Response) => {
  res.json(getAdminStats());
});

router.get('/users', requirePermission('users.read'), (_req: Request, res: Response) => {
  res.json({ users: getAllUsers() });
});

router.post('/users', requirePermission('users.write'), (req: Request, res: Response) => {
  const { phoneNumber, name, role, farmerId, district, region } = req.body;
  if (!phoneNumber || !name || !role) {
    res.status(400).json({ error: 'phoneNumber, name, and role are required' });
    return;
  }
  try {
    const userId = createUser({ phoneNumber, name, role: role as UserRole, farmerId, district, region });
    logAudit({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: 'user.create',
      category: 'system',
      resourceType: 'user',
      resourceId: userId,
      details: { role, name },
      success: true,
    });
    res.status(201).json({ userId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
  }
});

router.get('/farmers', requirePermission('farmers.read'), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const country = (req.query.country as string) || undefined;
  let farmers = getAllFarmers(limit, offset, country);

  if (isAgentRole(req.user!.role) && req.user!.district) {
    farmers = (farmers as { district: string }[]).filter((f) => f.district === req.user!.district);
  }

  logAudit({
    userId: req.user?.userId,
    userRole: req.user?.role,
    action: 'farmer.read',
    category: 'farmer_data',
    details: { count: (farmers as unknown[]).length, country },
    ipAddress: req.ip,
    success: true,
  });

  res.json({ farmers, total: getFarmerCount(country) });
});

router.get('/farmers/:farmerId', requirePermission('farmers.read'), (req: Request, res: Response) => {
  const farmer = getFarmerById(req.params.farmerId);
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found' });
    return;
  }

  if (isAgentRole(req.user!.role) && req.user!.district) {
    const row = farmer as { district: string };
    if (row.district !== req.user!.district) {
      res.status(403).json({ error: 'Farmer is outside your region' });
      return;
    }
  }

  logAudit({
    userId: req.user?.userId,
    userRole: req.user?.role,
    action: 'farmer.read',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: req.params.farmerId,
    ipAddress: req.ip,
    success: true,
  });

  res.json({ farmer });
});

export default router;
