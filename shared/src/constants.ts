export const CSV_COLUMNS = [
  'Key',
  'Name',
  'Gender',
  'ID Number',
  'Membership Group',
  'Aggregation center',
  'Phone',
  'Country',
  'District',
  'Sub-County',
  'Parish',
  'Village',
  'Membership Type',
  'Occupation',
  'Size of land',
  'Project 1',
  'Project 2',
  'Project 3',
  'Picture',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export const GENDER_OPTIONS = ['M', 'F', 'Other'] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  M: 'Male',
  F: 'Female',
  Other: 'Other',
};

export const MEMBERSHIP_TYPES = ['Active', 'Inactive', 'Suspended'] as const;
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export const DISTRICTS = [
  'Kiambu',
  'Nairobi',
  'Kajiado',
  'Gulu',
  'Uasin Gishu',
  'Nakuru',
  'Mombasa',
  'Kisumu',
] as const;

export type District = (typeof DISTRICTS)[number];

export const SUB_COUNTIES: Record<District, string[]> = {
  Kiambu: ['Limuru', 'Thika', 'Ruiru', 'Gatundu', 'Kiambu Town'],
  Nairobi: ['Kasarani', 'Westlands', 'Embakasi', 'Dagoretti', 'Starehe'],
  Kajiado: ['Kajiado North', 'Kajiado East', 'Kajiado Central', 'Loitokitok'],
  Gulu: ['Central', 'Pader', 'Omoro', 'Nwoya'],
  'Uasin Gishu': ['Eldoret', 'Moiben', 'Turbo', 'Soy'],
  Nakuru: ['Nakuru Town', 'Naivasha', 'Gilgil', 'Molo'],
  Mombasa: ['Mvita', 'Nyali', 'Changamwe', 'Kisauni'],
  Kisumu: ['Kisumu Central', 'Kisumu East', 'Kisumu West', 'Seme'],
};

export const MEMBERSHIP_GROUPS = [
  'Gulu Women Economic Dev',
  'Kiambu Cooperative',
  'Nairobi Women Coop',
  'Test Coop',
] as const;

export const PROJECTS = [
  'Coffee Training',
  'Soil Health',
  'Baseline Survey',
  'Water Conservation',
  'Pest Management',
] as const;

export const COLORS = {
  primary: '#1A4D3E',
  accent: '#D4AF6A',
  background: '#FFFFFF',
  text: '#333333',
  success: '#2E7D5E',
  alert: '#D32F2F',
  info: '#1976D2',
  border: '#E0E0E0',
  muted: '#757575',
} as const;

export const MAX_CSV_SIZE_BYTES = 50 * 1024 * 1024;
