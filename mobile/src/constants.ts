export const COLORS = {
  primary: '#1A4D3E',
  accent: '#D4AF6A',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#333333',
  success: '#2E7D5E',
  alert: '#D32F2F',
  info: '#1976D2',
  warning: '#FF9800',
  border: '#E0E0E0',
  muted: '#757575',
  cardBg: '#F9F9F9',
};

export const CSV_COLUMNS = [
  'Key', 'Name', 'Gender', 'ID Number', 'Membership Group',
  'Aggregation center', 'Phone', 'Country', 'District', 'Sub-County',
  'Parish', 'Village', 'Membership Type', 'Occupation', 'Size of land',
  'Project 1', 'Project 2', 'Project 3', 'Picture',
];

export const GENDER_OPTIONS = [
  { label: 'Male', value: 'M' },
  { label: 'Female', value: 'F' },
  { label: 'Other', value: 'Other' },
];

export const MEMBERSHIP_TYPES = ['Active', 'Inactive', 'Suspended'];

export const DISTRICTS = [
  'Kiambu', 'Nairobi', 'Kajiado', 'Gulu', 'Uasin Gishu', 'Nakuru', 'Mombasa', 'Kisumu',
];

export const SUB_COUNTIES: Record<string, string[]> = {
  Kiambu: ['Limuru', 'Thika', 'Ruiru', 'Gatundu', 'Kiambu Town'],
  Nairobi: ['Kasarani', 'Westlands', 'Embakasi', 'Dagoretti', 'Starehe'],
  Kajiado: ['Kajiado North', 'Kajiado East', 'Kajiado Central', 'Loitokitok'],
  Gulu: ['Central', 'Pader', 'Omoro', 'Nwoya'],
  'Uasin Gishu': ['Eldoret', 'Moiben', 'Turbo', 'Soy'],
  Nakuru: ['Nakuru Town', 'Naivasha', 'Gilgil', 'Molo'],
  Mombasa: ['Mvita', 'Nyali', 'Changamwe', 'Kisauni'],
  Kisumu: ['Kisumu Central', 'Kisumu East', 'Kisumu West', 'Seme'],
};

export const PROJECTS = [
  'Coffee Training', 'Soil Health', 'Baseline Survey', 'Water Conservation', 'Pest Management',
];

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
