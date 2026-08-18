/** Individual member occupation / category options (Loveable portal). */
export const INDIVIDUAL_MEMBERSHIP_CATEGORIES = [
  'Small scale farmer',
  'Large scale farmer',
  'Logistics operator',
  'Input supplier',
  'IT Staff',
  'Maintenance Staff',
  'Health worker',
  'Teaching staff',
  'Social worker',
  'Social beneficiary',
  'Government worker (Inspectors, Agronomists, etc.)',
  'Refugee',
  'Other',
] as const;

export const CORPORATE_CATEGORY_GROUPS = {
  INSTITUTIONS: ['Primary School', 'Secondary School', 'College', 'Research centre'],
  GOVERNMENT: ['Ministry department', 'Tax authorities'],
  TRADER: ['Exporter', 'Processor', 'Logistics operator'],
  'FUNDING AGENCY': ['UNAID', 'UKAID', 'Private Equity fund', 'Other'],
  'PARTNER ORGANISATION': ['Investors', 'Input supplier'],
  Other: [] as string[],
} as const;

export type CorporateCategoryGroup = keyof typeof CORPORATE_CATEGORY_GROUPS;

export const CORPORATE_CATEGORY_GROUP_LABELS = Object.keys(
  CORPORATE_CATEGORY_GROUPS
) as CorporateCategoryGroup[];

export const REGISTRATION_CATEGORIES = [
  { value: 'individual', label: 'Individual member' },
  { value: 'corporate', label: 'Corporate / organization' },
] as const;

export type RegistrationCategory = 'individual' | 'corporate';

export const LAND_UNITS = ['Ha', 'Acres'] as const;

export const SPECIAL_NEEDS_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
] as const;

export const CURRENCY_OPTIONS = [
  'KES', 'UGX', 'TZS', 'RWF', 'BIF', 'CDF', 'SSP', 'SOS', 'ETB', 'ZMW', 'MWK', 'MZN',
] as const;
