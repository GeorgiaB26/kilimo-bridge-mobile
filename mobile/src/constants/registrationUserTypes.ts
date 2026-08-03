export type RegistrationUserType = 'farmer' | 'field_agent' | 'admin' | 'project_manager';

export const REGISTRATION_USER_TYPES: Array<{
  id: RegistrationUserType;
  label: string;
  description: string;
  icon: string;
  requiresApproval?: boolean;
}> = [
  {
    id: 'farmer',
    label: 'Farmer',
    description: 'Register as a farmer',
    icon: '🌾',
  },
  {
    id: 'field_agent',
    label: 'Field Agent',
    description: 'Register as field agent',
    icon: '👨‍🌾',
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Admin user access',
    icon: '👔',
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    description: 'Tech team approval only',
    icon: '📋',
    requiresApproval: true,
  },
];
