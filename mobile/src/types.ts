export interface RegistrationFormData {
  name: string;
  gender: 'M' | 'F' | 'Other';
  phone: string;
  idNumber: string;
  country: string;
  currency?: string;
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
  membershipGroup: string;
  aggregationCenter?: string;
  membershipType?: string;
  occupation?: string;
  sizeOfLand?: string;
  project1?: string;
  project2?: string;
  project3?: string;
  pictureUri?: string;
}

export interface ImportValidationResult {
  status: string;
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
  importHints?: string[];
}
