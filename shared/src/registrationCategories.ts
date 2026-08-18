/** Shared registration category helpers for API validation. */
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

export const REGISTRATION_CATEGORIES = ['individual', 'corporate'] as const;

export type RegistrationCategory = (typeof REGISTRATION_CATEGORIES)[number];

export const LAND_UNITS = ['Ha', 'Acres'] as const;
