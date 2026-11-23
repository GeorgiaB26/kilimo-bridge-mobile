import type { ComponentType } from 'react';
import { ClipboardList, Sprout, UserRound } from 'lucide-react-native';

export type RegistrationUserType = 'farmer' | 'field_agent' | 'project_manager';

export type RegistrationTypeIcon = ComponentType<{ size?: number | string; color?: string }>;

export const REGISTRATION_USER_TYPES: Array<{
  id: RegistrationUserType;
  label: string;
  description: string;
  Icon: RegistrationTypeIcon;
  requiresApproval?: boolean;
}> = [
  {
    id: 'farmer',
    label: 'Farmer',
    description: 'Register as a farmer',
    Icon: Sprout,
  },
  {
    id: 'field_agent',
    label: 'Field Agent',
    description: 'Register as field agent',
    Icon: UserRound,
    requiresApproval: true,
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    description: 'Tech team approval only',
    Icon: ClipboardList,
    requiresApproval: true,
  },
];
