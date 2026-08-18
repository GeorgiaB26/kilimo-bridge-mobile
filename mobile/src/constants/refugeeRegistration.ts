export const REFUGEE_MEMBERSHIP_CATEGORY = 'Refugee';

export const HUMANITARIAN_ASSISTANCE_TYPES = [
  'Food assistance',
  'Shelter assistance',
  'Medical assistance',
  'Education support',
  'Cash transfer',
  'Water & sanitation',
  'Other',
] as const;

export const PREFERRED_LANGUAGES = [
  'English',
  'Swahili',
  'Arabic',
  'French',
  'Somali',
  'Amharic',
  'Other',
] as const;

export const SPECIAL_VULNERABILITIES_OPTIONS = [
  'Single parent / Widow',
  'Elderly (60 years or older)',
  'Disabled / Mobility issues',
  'Medical condition requiring support',
  'Unaccompanied minor (requires guardian)',
  'Other',
] as const;

export const MAX_REFUGEE_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function isRefugeeCategory(membershipCategory?: string): boolean {
  const cat = membershipCategory?.trim();
  return cat === REFUGEE_MEMBERSHIP_CATEGORY || cat?.startsWith('Refugee');
}
