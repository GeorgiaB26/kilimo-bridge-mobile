import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthUser } from '../services/authService';
import { hasPermission, Permission, UserRole, normalizeRole, isAgentRole } from '../../../shared/src/roles';
import { logAudit } from '../services/auditService';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = verifyToken(header.slice(7));
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = { ...user, role: normalizeRole(user.role) as UserRole };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const userRole = normalizeRole(req.user.role);
    if (!roles.includes(userRole)) {
      logAudit({
        userId: req.user.userId,
        userRole: req.user.role,
        action: 'permission.denied',
        category: 'system',
        details: { required: roles, actual: req.user.role, path: req.path },
        ipAddress: req.ip,
        success: false,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!hasPermission(req.user.role, permission)) {
      logAudit({
        userId: req.user.userId,
        userRole: req.user.role,
        action: 'permission.denied',
        category: 'system',
        details: { permission, path: req.path },
        ipAddress: req.ip,
        success: false,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Agents can only access resources in their region/district */
export function requireRegionAccess(getRegionFromResource: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!isAgentRole(req.user.role)) {
      next();
      return;
    }
    const resourceRegion = getRegionFromResource(req);
    const agentRegion = req.user.region || req.user.district;
    if (resourceRegion && agentRegion && resourceRegion !== agentRegion) {
      logAudit({
        userId: req.user.userId,
        userRole: req.user.role,
        action: 'permission.denied',
        category: 'agent',
        details: { reason: 'region_mismatch', agentRegion, resourceRegion },
        ipAddress: req.ip,
        success: false,
      });
      res.status(403).json({ error: 'Access denied: resource outside your region' });
      return;
    }
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const user = verifyToken(header.slice(7));
    if (user) req.user = { ...user, role: normalizeRole(user.role) as UserRole };
  }
  next();
}
