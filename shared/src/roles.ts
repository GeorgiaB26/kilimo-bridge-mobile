export type UserRole =
  | 'farmer'
  | 'agent'
  | 'banking_agent'
  | 'admin'
  | 'super_admin'
  | 'platform_admin'
  | 'banking_admin';

/** @deprecated Use 'agent' — kept for DB migration */
export type LegacyRole = 'field_officer';

/** Roles only platform_admin may create or remove */
export const ELEVATED_ROLES: UserRole[] = ['platform_admin', 'super_admin'];

/** Banking-domain roles */
export const BANKING_ROLES: UserRole[] = ['banking_agent', 'banking_admin'];

export const ROLE_LABELS: Record<UserRole, string> = {
  farmer: 'Farmer',
  agent: 'Aggregation Centre Agent',
  banking_agent: 'Banking Agent',
  admin: 'Regional Administrator',
  super_admin: 'Super Admin',
  platform_admin: 'Platform Admin',
  banking_admin: 'Banking Admin',
};

export const PERMISSIONS = {
  // Farmer data
  'farmers.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'farmers.read.own': ['farmer'] as UserRole[],
  'farmers.write': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'farmers.import': ['admin', 'super_admin', 'platform_admin'] as UserRole[],

  // Agents
  'agents.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'agents.register': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],

  // Users
  'users.read': ['admin', 'super_admin', 'platform_admin', 'banking_admin'] as UserRole[],
  'users.write': ['super_admin', 'platform_admin'] as UserRole[],
  /** Create/remove platform_admin and super_admin — platform_admin only */
  'users.write.elevated': ['platform_admin'] as UserRole[],
  /** Manage banking_agent accounts */
  'users.write.banking_agents': ['banking_admin', 'platform_admin'] as UserRole[],

  // Reports & audit
  'reports.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'audit.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'audit.read.financial': ['banking_agent', 'banking_admin', 'platform_admin'] as UserRole[],
  'audit.read.own': ['agent', 'farmer'] as UserRole[],

  // Payments
  'payments.read': ['farmer', 'banking_agent', 'banking_admin', 'platform_admin'] as UserRole[],
  'payments.read.own': ['farmer'] as UserRole[],
  'payments.process': ['banking_agent', 'platform_admin'] as UserRole[],
  'payments.verify': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],

  // Profile & projects (farmer portal)
  'profile.read': ['farmer'] as UserRole[],
  'projects.read': ['farmer'] as UserRole[],

  // Phase 2 hierarchy
  'hierarchy.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'hierarchy.read.own': ['farmer'] as UserRole[],
  'hierarchy.write': ['admin', 'super_admin', 'platform_admin'] as UserRole[],
  'hierarchy.assign': ['admin', 'super_admin', 'platform_admin', 'agent'] as UserRole[],
  'tasks.read': ['agent', 'admin', 'super_admin', 'platform_admin', 'farmer'] as UserRole[],
  'tasks.submit': ['farmer'] as UserRole[],
  'tasks.approve': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  'centres.read': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],
  /** Farmer may view only their own assigned aggregation centre (name/location/contact). */
  'centres.read.own': ['farmer'] as UserRole[],
  'centres.manage': ['agent', 'admin', 'super_admin', 'platform_admin'] as UserRole[],

  // Banking H2H
  'banking.h2h': ['banking_agent', 'platform_admin'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function normalizeRole(role: string): UserRole {
  if (role === 'field_officer') return 'agent';
  if (role === 'banking') return 'banking_agent';
  return role as UserRole;
}

export function hasPermission(role: UserRole | string, permission: Permission): boolean {
  const normalized = normalizeRole(role);
  if (normalized === 'platform_admin') return true;
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(normalized);
}

export function hasAnyPermission(role: UserRole | string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function isStaffRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return (
    r === 'agent' ||
    r === 'admin' ||
    r === 'super_admin' ||
    r === 'platform_admin' ||
    r === 'banking_agent' ||
    r === 'banking_admin'
  );
}

/** Admin-platform navigator: regional admin, super admin, platform admin */
export function isAdminRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin' || r === 'platform_admin';
}

export function isPlatformAdminRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'platform_admin';
}

export function isSuperAdminRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'super_admin';
}

/** Regional admin — scoped to assigned region/cooperative */
export function isRegionalAdminRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'admin';
}

export function isBankingRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return r === 'banking_agent' || r === 'banking_admin';
}

export function isBankingAgentRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'banking_agent';
}

export function isBankingAdminRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'banking_admin';
}

export function isAgentRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'agent';
}

/** Roles whose data access is limited to their assigned region/district */
export function isRegionScopedRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return r === 'agent' || r === 'admin';
}

/** Whether creatorRole may create a user with targetRole */
export function canCreateUserRole(creatorRole: UserRole | string, targetRole: UserRole | string): boolean {
  const creator = normalizeRole(creatorRole);
  const target = normalizeRole(targetRole);

  if (creator === 'platform_admin') return true;

  if (ELEVATED_ROLES.includes(target)) return false;

  if (creator === 'super_admin') {
    return ['admin', 'agent', 'farmer'].includes(target);
  }

  if (creator === 'banking_admin') {
    return target === 'banking_agent';
  }

  return false;
}
