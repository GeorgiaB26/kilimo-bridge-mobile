import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import { getAllUsers, getAdminStats, createUser } from '../services/userService';
import { getAllFarmers, getFarmerCount, getFarmerById } from '../services/farmerService';
import { logAudit } from '../services/auditService';
import {
  isAgentRole,
  isRegionalAdminRole,
  isBankingAdminRole,
  isRegionScopedRole,
  canCreateUserRole,
  normalizeRole,
} from '../../../shared/src/roles';
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
router.use(requireRole('platform_admin', 'super_admin', 'admin', 'agent'));

router.get(
  '/dashboard',
  requirePermission('reports.read'),
  asyncHandler(async (_req, res) => {
    const stats = await getAdminStats();
    res.json(stats);
  })
);

function filterUsersForViewer(
  users: Array<{ role: string; district?: string | null; region?: string | null }>,
  viewerRole: UserRole,
  viewerDistrict?: string,
  viewerRegion?: string
) {
  if (isBankingAdminRole(viewerRole)) {
    return users.filter((u) => normalizeRole(u.role) === 'banking_agent');
  }
  if (isRegionalAdminRole(viewerRole)) {
    const scope = viewerRegion ?? viewerDistrict;
    if (!scope) return users;
    return users.filter(
      (u) => u.district === scope || u.region === scope || normalizeRole(u.role) === 'farmer'
    );
  }
  return users;
}

function isOutsideViewerScope(
  resource: { district?: string; region?: string },
  viewerRole: UserRole,
  viewerDistrict?: string,
  viewerRegion?: string
): boolean {
  if (!isRegionScopedRole(viewerRole)) return false;
  const scope = viewerRegion ?? viewerDistrict;
  if (!scope) return false;
  if (isAgentRole(viewerRole)) {
    return resource.district !== scope;
  }
  if (isRegionalAdminRole(viewerRole)) {
    return resource.district !== scope && resource.region !== scope;
  }
  return false;
}

router.get(
  '/users',
  requirePermission('users.read'),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string) || undefined;
    const allUsers = await getAllUsers(q);
    const users = filterUsersForViewer(
      allUsers as Array<{ role: string; district?: string | null; region?: string | null }>,
      req.user!.role,
      req.user!.district,
      req.user!.region
    );
    res.json({ users });
  })
);

router.post(
  '/users',
  requirePermission('users.write'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, name, role, farmerId, district, region } = req.body;
    if (!phoneNumber || !name || !role) {
      res.status(400).json({ error: 'phoneNumber, name, and role are required' });
      return;
    }

    const targetRole = normalizeRole(role);
    if (!canCreateUserRole(req.user!.role, targetRole)) {
      res.status(403).json({ error: `Your role cannot create ${targetRole} accounts` });
      return;
    }

    try {
      const userId = await createUser({
        phoneNumber,
        name,
        role: targetRole,
        farmerId,
        district,
        region,
      });
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

router.get(
  '/farmers',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const country = (req.query.country as string) || undefined;
    const q = (req.query.q as string) || undefined;
    let farmers = await getAllFarmers(limit, offset, country, q);

    if (isRegionScopedRole(req.user!.role)) {
      const scope = req.user!.region ?? req.user!.district;
      if (scope) {
        farmers = (farmers as { district: string; region?: string }[]).filter(
          (f) => f.district === scope || f.region === scope
        );
      }
    }

    void logAudit({
      userId: req.user?.userId,
      userRole: req.user?.role,
      action: 'farmer.read',
      category: 'farmer_data',
      details: { count: (farmers as unknown[]).length, country, search: q },
      ipAddress: req.ip,
      success: true,
    });

    res.json({ farmers, total: (farmers as unknown[]).length });
  })
);

router.get(
  '/farmers/:farmerId',
  requirePermission('farmers.read'),
  asyncHandler(async (req, res) => {
    const farmer = await getFarmerById(req.params.farmerId);
    if (!farmer) {
      res.status(404).json({ error: 'Farmer not found' });
      return;
    }

    const f = farmer as { district?: string; region?: string };
    if (isOutsideViewerScope(f, req.user!.role, req.user!.district, req.user!.region)) {
      res.status(403).json({ error: 'Farmer is outside your assigned region' });
      return;
    }

    void logAudit({
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
  })
);

export default router;
