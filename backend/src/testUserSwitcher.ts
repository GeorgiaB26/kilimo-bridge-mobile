/** Dev / pilot quick-login accounts for mobile test switcher */
export const TEST_SWITCHER_USERS: Record<
  string,
  { phone: string; label: string; statusLabel: string; emoji: string }
> = {
  farmer: {
    phone: '+254712345678',
    label: 'Test as FARMER',
    statusLabel: 'Verified ✅',
    emoji: '🌾',
  },
  field_agent: {
    phone: '+254745678901',
    label: 'Test as FIELD AGENT',
    statusLabel: 'Active ✅',
    emoji: '👨‍🌾',
  },
};

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PILOT_OTP === 'true';
}

export function resolveTestSwitcherPhone(role: string): string | null {
  const entry = TEST_SWITCHER_USERS[role];
  return entry?.phone ?? null;
}
