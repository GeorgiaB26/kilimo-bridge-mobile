import { Router, Request, Response } from 'express';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import { getAllUsers, getAdminStats, createUser } from '../services/userService';
import { getAllFarmers, getFarmerCount } from '../services/farmerService';
import type { UserRole } from '../../../shared/src/roles';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin', 'admin', 'field_officer'));

router.get('/dashboard', requirePermission('reports.read'), (_req: Request, res: Response) => {
  res.json(getAdminStats());
});

router.get('/users', requireRole('super_admin', 'admin'), (_req: Request, res: Response) => {
  res.json({ users: getAllUsers() });
});

router.post('/users', requireRole('super_admin'), (req: Request, res: Response) => {
  const { phoneNumber, name, role, farmerId, district } = req.body;
  if (!phoneNumber || !name || !role) {
    res.status(400).json({ error: 'phoneNumber, name, and role are required' });
    return;
  }
  try {
    const userId = createUser({ phoneNumber, name, role: role as UserRole, farmerId, district });
    res.status(201).json({ userId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
  }
});

router.get('/farmers', requirePermission('farmers.read'), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  let farmers = getAllFarmers(limit, offset);

  // Field officers only see farmers in their district
  if (req.user?.role === 'field_officer' && req.user.district) {
    farmers = (farmers as { district: string }[]).filter((f) => f.district === req.user!.district);
  }

  res.json({ farmers, total: getFarmerCount() });
});

export default router;
