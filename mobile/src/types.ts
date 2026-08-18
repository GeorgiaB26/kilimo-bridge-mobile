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
  ward?: string;
  membershipGroup: string;
  aggregationCenter?: string;
  aggregationCentreId?: string;
  /** Individual vs corporate — immutable registration category (not Active/Inactive). */
  registrationCategory?: 'individual' | 'corporate';
  /** Legacy CSV membership type — not collected on mobile; backend defaults Active. */
  membershipType?: string;
  membershipCategory?: string;
  membershipCategoryOther?: string;
  corporateCategoryGroup?: string;
  corporateCategorySub?: string;
  corporateCategoryOther?: string;
  profession?: string;
  occupation?: string;
  sizeOfLand?: string;
  landUnit?: 'Ha' | 'Acres';
  farmInputRequired?: string;
  familySize?: string;
  numberOfDependants?: string;
  specialNeeds?: 'yes' | 'no';
  projectLocationGps?: string;
  organizationName?: string;
  organizationRegistrationNumber?: string;
  taxPin?: string;
  contactPersonName?: string;
  contactPersonRole?: string;
  contactPersonEmail?: string;
  projectEnrolmentSectorId?: string;
  projectEnrolmentProgramId?: string;
  projectEnrolmentProjectId?: string;
  skipProjectEnrolment?: boolean;
  refugeeStatusDocumentUrl?: string;
  refugeeStatusDocumentUri?: string;
  refugeeStatusDocumentBase64?: string;
  humanitarianAssistanceType?: string;
  humanitarianAssistanceOther?: string;
  preferredLanguage?: string;
  preferredLanguageOther?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  specialVulnerabilities?: string[];
  specialVulnerabilitiesOther?: string;
  pictureBase64?: string;
  project1?: string;
  project2?: string;
  project3?: string;
  pictureUri?: string;
}

/** POST /farmers/register body — vulnerabilities are a comma-separated string, not the form's string[]. */
export type FarmerRegistrationPayload = Omit<RegistrationFormData, 'specialVulnerabilities'> & {
  specialVulnerabilities?: string;
};

export interface ImportValidationResult {
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  willImport: number;
  totalErrors?: number;
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
