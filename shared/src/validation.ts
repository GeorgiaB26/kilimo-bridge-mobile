import {
  DISTRICTS,
  GENDER_OPTIONS,
  MEMBERSHIP_TYPES,
  SUB_COUNTIES,
  type District,
  type Gender,
} from './constants';

export interface FarmerInput {
  key: string;
  name: string;
  gender: string;
  idNumber: string;
  membershipGroup: string;
  aggregationCenter?: string;
  phone: string;
  country?: string;
  district: string;
  subCounty: string;
  parish?: string;
  village?: string;
  membershipType?: string;
  occupation?: string;
  sizeOfLand?: number | string;
  project1?: string;
  project2?: string;
  project3?: string;
  picture?: string;
}

export interface FieldError {
  field: string;
  value: string;
  error: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
  normalized: Partial<FarmerInput>;
}

const NAME_PATTERN = /^[a-zA-Z\s'-]+$/;

export function normalizePhone(phone: string): string | null {
  const cleaned = phone.replace(/\s/g, '');
  if (/^\+254[0-9]{9}$/.test(cleaned)) return cleaned;
  if (/^0[0-9]{9}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^[0-9]{9}$/.test(cleaned)) return `+254${cleaned}`;
  return null;
}

export function normalizeGender(value: string): Gender | null {
  const v = value.trim();
  if (GENDER_OPTIONS.includes(v as Gender)) return v as Gender;
  const map: Record<string, Gender> = {
    male: 'M',
    m: 'M',
    female: 'F',
    f: 'F',
    other: 'Other',
  };
  return map[v.toLowerCase()] ?? null;
}

function isValidDistrict(value: string): value is District {
  return (DISTRICTS as readonly string[]).includes(value);
}

export function validateFarmerRow(
  input: FarmerInput,
  options: {
    existingPhones?: Set<string>;
    existingIdNumbers?: Set<string>;
    existingKeys?: Set<string>;
    membershipGroups?: string[];
    rowNumber?: number;
  } = {}
): ValidationResult {
  const errors: FieldError[] = [];
  const normalized: Partial<FarmerInput> = {};

  const key = input.key?.trim();
  if (!key) {
    errors.push({ field: 'key', value: input.key ?? '', error: 'Key is required' });
  } else if (options.existingKeys?.has(key)) {
    errors.push({ field: 'key', value: key, error: 'Key already exists in system' });
  } else {
    normalized.key = key;
  }

  const name = input.name?.trim();
  if (!name || name.length < 2 || name.length > 100) {
    errors.push({
      field: 'name',
      value: input.name ?? '',
      error: 'Name must be 2-100 characters',
    });
  } else if (!NAME_PATTERN.test(name)) {
    errors.push({
      field: 'name',
      value: name,
      error: 'Name must contain letters only',
    });
  } else {
    normalized.name = name;
  }

  const gender = normalizeGender(input.gender ?? '');
  if (!gender) {
    errors.push({
      field: 'gender',
      value: input.gender ?? '',
      error: 'Gender must be M, F, or Other',
    });
  } else {
    normalized.gender = gender;
  }

  const idNumber = input.idNumber?.trim();
  if (!idNumber || idNumber.length < 5 || idNumber.length > 50) {
    errors.push({
      field: 'idNumber',
      value: input.idNumber ?? '',
      error: 'ID number must be 5-50 characters',
    });
  } else if (options.existingIdNumbers?.has(idNumber)) {
    errors.push({
      field: 'idNumber',
      value: idNumber,
      error: 'ID number already exists in system',
    });
  } else {
    normalized.idNumber = idNumber;
  }

  const membershipGroup = input.membershipGroup?.trim();
  const groups = options.membershipGroups ?? [];
  if (!membershipGroup) {
    errors.push({
      field: 'membershipGroup',
      value: input.membershipGroup ?? '',
      error: 'Membership group is required',
    });
  } else if (groups.length > 0 && !groups.includes(membershipGroup)) {
    const suggestion = groups.find((g) =>
      g.toLowerCase().includes(membershipGroup.toLowerCase())
    );
    errors.push({
      field: 'membershipGroup',
      value: membershipGroup,
      error: `Membership group "${membershipGroup}" not found`,
      suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
    });
  } else {
    normalized.membershipGroup = membershipGroup;
  }

  const phone = normalizePhone(input.phone ?? '');
  if (!phone) {
    errors.push({
      field: 'phone',
      value: input.phone ?? '',
      error: 'Invalid format. Expected +254... or 07...',
      suggestion: input.phone?.startsWith('0') ? `${input.phone}8` : undefined,
    });
  } else if (options.existingPhones?.has(phone)) {
    errors.push({
      field: 'phone',
      value: input.phone ?? '',
      error: 'Phone number already exists in system',
    });
  } else {
    normalized.phone = phone;
  }

  const country = input.country?.trim() || 'Kenya';
  normalized.country = country;

  const district = input.district?.trim();
  if (!district || !isValidDistrict(district)) {
    errors.push({
      field: 'district',
      value: input.district ?? '',
      error: 'Please select a valid district',
    });
  } else {
    normalized.district = district;
    const subCounty = input.subCounty?.trim();
    const validSubs = SUB_COUNTIES[district];
    if (!subCounty || subCounty.length < 2 || subCounty.length > 100) {
      errors.push({
        field: 'subCounty',
        value: input.subCounty ?? '',
        error: 'Sub-county is required (2-100 characters)',
      });
    } else if (!validSubs.some((s) => s.toLowerCase() === subCounty.toLowerCase())) {
      errors.push({
        field: 'subCounty',
        value: subCounty,
        error: `Sub-county "${subCounty}" does not match district "${district}"`,
        suggestion: validSubs[0] ? `Did you mean "${validSubs[0]}"?` : undefined,
      });
    } else {
      normalized.subCounty = validSubs.find((s) => s.toLowerCase() === subCounty.toLowerCase())!;
    }
  }

  if (input.parish?.trim()) normalized.parish = input.parish.trim();
  if (input.village?.trim()) normalized.village = input.village.trim();
  if (input.aggregationCenter?.trim()) normalized.aggregationCenter = input.aggregationCenter.trim();

  const membershipType = input.membershipType?.trim();
  if (membershipType && !(MEMBERSHIP_TYPES as readonly string[]).includes(membershipType)) {
    errors.push({
      field: 'membershipType',
      value: membershipType,
      error: 'Membership type must be Active, Inactive, or Suspended',
    });
  } else if (membershipType) {
    normalized.membershipType = membershipType;
  }

  if (input.occupation?.trim()) {
    const occ = input.occupation.trim();
    if (occ.length < 2 || occ.length > 50) {
      errors.push({ field: 'occupation', value: occ, error: 'Occupation must be 2-50 characters' });
    } else {
      normalized.occupation = occ;
    }
  }

  if (input.sizeOfLand !== undefined && input.sizeOfLand !== '') {
    const size = typeof input.sizeOfLand === 'number' ? input.sizeOfLand : parseFloat(input.sizeOfLand);
    if (isNaN(size) || size < 0 || size > 1000) {
      errors.push({
        field: 'sizeOfLand',
        value: String(input.sizeOfLand),
        error: 'Size of land must be between 0-1000 acres',
      });
    } else {
      normalized.sizeOfLand = size;
    }
  }

  if (input.project1?.trim()) normalized.project1 = input.project1.trim();
  if (input.project2?.trim()) normalized.project2 = input.project2.trim();
  if (input.project3?.trim()) normalized.project3 = input.project3.trim();
  if (input.picture?.trim()) normalized.picture = input.picture.trim();

  return { valid: errors.length === 0, errors, normalized };
}

export function csvRowToFarmerInput(row: Record<string, string>): FarmerInput {
  return {
    key: row['Key'] ?? '',
    name: row['Name'] ?? '',
    gender: row['Gender'] ?? '',
    idNumber: row['ID Number'] ?? '',
    membershipGroup: row['Membership Group'] ?? '',
    aggregationCenter: row['Aggregation center'] ?? '',
    phone: row['Phone'] ?? '',
    country: row['Country'] ?? 'Kenya',
    district: row['District'] ?? '',
    subCounty: row['Sub-County'] ?? '',
    parish: row['Parish'] ?? '',
    village: row['Village'] ?? '',
    membershipType: row['Membership Type'] ?? '',
    occupation: row['Occupation'] ?? '',
    sizeOfLand: row['Size of land'] ?? '',
    project1: row['Project 1'] ?? '',
    project2: row['Project 2'] ?? '',
    project3: row['Project 3'] ?? '',
    picture: row['Picture'] ?? '',
  };
}

export function headersMatchExpected(headers: string[]): boolean {
  const expected = [
    'Key', 'Name', 'Gender', 'ID Number', 'Membership Group',
    'Aggregation center', 'Phone', 'Country', 'District', 'Sub-County',
    'Parish', 'Village', 'Membership Type', 'Occupation', 'Size of land',
    'Project 1', 'Project 2', 'Project 3', 'Picture',
  ];
  if (headers.length !== expected.length) return false;
  return expected.every((h, i) => headers[i]?.trim() === h);
}

export function suggestColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    Key: ['key', 'id', 'farmer_key', 'farmer id'],
    Name: ['name', 'full name', 'farmer name'],
    Gender: ['gender', 'sex'],
    'ID Number': ['id number', 'id_number', 'national id', 'national_id', 'id'],
    'Membership Group': ['membership group', 'cooperative', 'coop', 'membership_group'],
    'Aggregation center': ['aggregation center', 'aggregation_center', 'center'],
    Phone: ['phone', 'phone number', 'phone_number', 'mobile'],
    Country: ['country'],
    District: ['district', 'county'],
    'Sub-County': ['sub-county', 'sub county', 'sub_county', 'subcounty'],
    Parish: ['parish'],
    Village: ['village'],
    'Membership Type': ['membership type', 'membership_type', 'status'],
    Occupation: ['occupation', 'job'],
    'Size of land': ['size of land', 'land size', 'size_of_land', 'acres'],
    'Project 1': ['project 1', 'project_1', 'project1'],
    'Project 2': ['project 2', 'project_2', 'project2'],
    'Project 3': ['project 3', 'project_3', 'project3'],
    Picture: ['picture', 'photo', 'image', 'picture_url'],
  };

  const expectedCols = Object.keys(aliases);
  for (const col of expectedCols) {
    const header = headers.find((h) =>
      aliases[col].includes(h.trim().toLowerCase())
    );
    if (header) mapping[col] = header;
  }
  return mapping;
}
