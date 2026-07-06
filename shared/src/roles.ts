export type UserRole = 'farmer' | 'agent' | 'admin' | 'banking' | 'super_admin';

/** @deprecated Use 'agent' — kept for DB migration */
export type LegacyRole = 'field_officer';

export const ROLE_LABELS: Record<UserRole, string> = {
  farmer: 'Farmer',
  agent: 'Aggregation Centre Agent',
  admin: 'Administrator',
  banking: 'Banking Officer',
  super_admin: 'Super Admin',
};

export const PERMISSIONS = {
  // Farmer data
  'farmers.read': ['agent', 'admin', 'banking', 'super_admin'] as UserRole[],
  'farmers.read.own': ['farmer'] as UserRole[],
  'farmers.write': ['agent', 'admin', 'super_admin'] as UserRole[],
  'farmers.import': ['admin', 'super_admin'] as UserRole[],

  // Agents
  'agents.read': ['agent', 'admin', 'super_admin'] as UserRole[],
  'agents.register': ['agent', 'admin', 'super_admin'] as UserRole[],

  // Users
  'users.read': ['admin', 'super_admin'] as UserRole[],
  'users.write': ['super_admin'] as UserRole[],

  // Reports & audit
  'reports.read': ['agent', 'admin', 'banking', 'super_admin'] as UserRole[],
  'audit.read': ['agent', 'admin', 'banking', 'super_admin'] as UserRole[],
  'audit.read.own': ['agent', 'farmer'] as UserRole[],

  // Payments
  'payments.read': ['farmer', 'banking', 'admin', 'super_admin'] as UserRole[],
  'payments.read.own': ['farmer'] as UserRole[],
  'payments.process': ['banking', 'admin', 'super_admin'] as UserRole[],
  'payments.verify': ['agent', 'banking', 'admin', 'super_admin'] as UserRole[],

  // Profile & projects
  'profile.read': ['farmer'] as UserRole[],
  'projects.read': ['farmer'] as UserRole[],

  // Banking H2H
  'banking.h2h': ['banking', 'super_admin'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function normalizeRole(role: string): UserRole {
  if (role === 'field_officer') return 'agent';
  return role as UserRole;
}

export function hasPermission(role: UserRole | string, permission: Permission): boolean {
  const normalized = normalizeRole(role);
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(normalized);
}

export function hasAnyPermission(role: UserRole | string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function isStaffRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return r === 'agent' || r === 'admin' || r === 'banking' || r === 'super_admin';
}

export function isAdminRole(role: UserRole | string): boolean {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'super_admin';
}

export function isBankingRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'banking';
}

export function isAgentRole(role: UserRole | string): boolean {
  return normalizeRole(role) === 'agent';
}
