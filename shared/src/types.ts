import type { Gender, MembershipType } from './constants';

export interface Farmer {
  farmerId: string;
  key: string;
  name: string;
  gender: Gender;
  idNumber: string;
  membershipGroupId: string;
  membershipGroupName?: string;
  aggregationCenter?: string;
  phoneNumber: string;
  country: string;
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
  membershipType?: MembershipType;
  occupation?: string;
  sizeOfLand?: number;
  pictureUrl?: string;
  project1?: string;
  project2?: string;
  project3?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportValidationResponse {
  status: 'validation_complete';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  willImport: number;
  errors: Array<{
    row: number;
    field: string;
    value: string;
    error: string;
    suggestion?: string;
  }>;
  preview: Array<{
    name: string;
    phone: string;
    district: string;
    membershipGroup: string;
    country?: string;
    status: 'valid' | 'invalid' | 'duplicate';
  }>;
  headersMatch: boolean;
  columnMapping?: Record<string, string>;
  sessionId: string;
  countryBreakdown?: Record<string, number>;
  errorsByCountry?: Record<string, number>;
  detectedCountry?: string | null;
}

export interface ImportProgressResponse {
  importId: string;
  importedCount: number;
  totalCount: number;
  percentComplete: number;
  status: 'in_progress' | 'complete' | 'failed';
}

export interface ImportCompleteResponse {
  status: 'import_complete';
  importId: string;
  importedCount: number;
  duplicatesSkipped: number;
  errorsCount: number;
  timestamp: string;
  errors: Array<{
    row: number;
    field: string;
    value: string;
    error: string;
    suggestion?: string;
  }>;
}

export interface RegistrationFormData {
  name: string;
  gender: Gender;
  phone: string;
  idNumber: string;
  country: string;
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
  membershipGroup: string;
  aggregationCenter?: string;
  membershipType?: MembershipType;
  occupation?: string;
  sizeOfLand?: string;
  project1?: string;
  project2?: string;
  project3?: string;
  pictureUri?: string;
}
