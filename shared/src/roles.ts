export type UserRole = 'super_admin' | 'admin' | 'field_officer' | 'farmer';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  field_officer: 'Field Officer',
  farmer: 'Farmer',
};

export const PERMISSIONS = {
  'farmers.read': ['super_admin', 'admin', 'field_officer'] as UserRole[],
  'farmers.write': ['super_admin', 'admin', 'field_officer'] as UserRole[],
  'farmers.import': ['super_admin', 'admin'] as UserRole[],
  'users.read': ['super_admin', 'admin'] as UserRole[],
  'users.write': ['super_admin'] as UserRole[],
  'reports.read': ['super_admin', 'admin'] as UserRole[],
  'profile.read': ['farmer'] as UserRole[],
  'payments.read': ['farmer'] as UserRole[],
  'projects.read': ['farmer'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'field_officer';
}
