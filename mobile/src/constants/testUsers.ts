import type { ComponentType } from 'react';
import { Sprout, UserRound } from 'lucide-react-native';

export type TestUserIcon = ComponentType<{ size?: number | string; color?: string }>;

export const TEST_SWITCHER_USERS = {
  farmer: {
    phone: '+254712345678',
    role: 'farmer' as const,
    label: 'Test as FARMER',
    statusLabel: 'Verified',
    Icon: Sprout as TestUserIcon,
  },
  field_agent: {
    phone: '+254745678901',
    role: 'field_agent' as const,
    label: 'Test as FIELD AGENT',
    statusLabel: 'Active',
    Icon: UserRound as TestUserIcon,
  },
} as const;

export type TestSwitcherRole = keyof typeof TEST_SWITCHER_USERS;

/** Show quick test login on login screen (hidden in production app builds). */
export const SHOW_TEST_USER_SWITCHER =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_DEV_TEST_LOGIN === 'true';
