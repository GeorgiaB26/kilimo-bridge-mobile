import {
  GENDER_OPTIONS,
  MEMBERSHIP_TYPES,
} from './constants';
import {
  getCountryConfig,
  getCountryCode,
  getLevel1Options,
  getLevel2Options,
  getLevel3Options,
  buildLocationPath,
  type CountryCode,
} from './regional';
import { normalizePhoneForCountry, generateFarmerId } from './farmerId';
import { findAggregationCentre } from './locations/aggregationCentres';

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
  kbFarmerId?: string;
  locationPath?: string;
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

type Gender = 'M' | 'F' | 'Other';

export function normalizePhone(phone: string, country = 'Kenya'): string | null {
  return normalizePhoneForCountry(phone, country);
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

/** Map cooperative CSV membership labels to system values */
export function normalizeMembershipType(value?: string): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (lower === 'individual' || lower === 'member') return 'Active';
  if ((MEMBERSHIP_TYPES as readonly string[]).includes(v)) return v;
  return undefined;
}

/** Uganda districts used to infer country when CSV has no Country column */
const UGANDA_DISTRICT_HINTS = new Set(
  [
    'Amuru', 'Gulu', 'Kampala', 'Lira', 'Mbarara', 'Wakiso', 'Jinja', 'Mbale', 'Arua', 'Kitgum',
    'Pader', 'Nwoya', 'Omoro', 'Lamwo', 'Agago', 'Oyam', 'Apac', 'Dokolo', 'Nebbi', 'Adjumani',
  ].map((d) => d.toLowerCase())
);

function inferCountryFromRow(input: FarmerInput): string {
  const explicit = input.country?.trim();
  if (explicit) return explicit;
  const district = input.district?.trim().toLowerCase();
  if (district && UGANDA_DISTRICT_HINTS.has(district)) return 'Uganda';
  return 'Kenya';
}

/** Fill missing import fields for cooperative bulk uploads (e.g. GWED-G) */
export function preprocessImportRow(input: FarmerInput, rowNumber: number): FarmerInput {
  const serial = input.key?.trim();
  const key = serial || `GWED-${String(rowNumber).padStart(5, '0')}`;
  const idNumber = input.idNumber?.trim() || `PENDING-${key}`;
  const gender = input.gender?.trim() ? input.gender : 'Other';
  const membershipType = normalizeMembershipType(input.membershipType) ?? input.membershipType;
  const country = inferCountryFromRow(input);

  return {
    ...input,
    key,
    idNumber,
    gender,
    membershipType,
    country,
  };
}

function resolveSubCounty(countryCode: CountryCode, district: string, subCounty: string): string | null {
  const options = getLevel2Options(countryCode, district);
  const exact = options.find((s) => s.toLowerCase() === subCounty.toLowerCase());
  if (exact) return exact;

  if (subCounty.toLowerCase() === district.toLowerCase()) {
    const districtMatch = options.find((s) => s.toLowerCase().startsWith(district.toLowerCase()));
    if (districtMatch) return districtMatch;
    return subCounty;
  }

  const partial = options.find(
    (s) =>
      s.toLowerCase().includes(subCounty.toLowerCase()) ||
      subCounty.toLowerCase().includes(s.toLowerCase().split(' ')[0] ?? '')
  );
  return partial ?? null;
}

function validateRegionalLocation(
  country: string,
  district: string,
  subCounty: string,
  parish?: string,
  relaxed = false
): { valid: boolean; error?: string; suggestion?: string; subCounty?: string; parish?: string } {
  const code = getCountryCode(country);
  if (!code) {
    return { valid: false, error: `Country "${country}" is not supported` };
  }

  const level1Options = getLevel1Options(code);
  const matchL1 = level1Options.find((d) => d.toLowerCase() === district.toLowerCase());
  if (!matchL1) {
    return {
      valid: false,
      error: `Invalid ${getCountryConfig(country)?.levelLabels[0] ?? 'region'}: "${district}"`,
      suggestion: level1Options[0] ? `Did you mean "${level1Options[0]}"?` : undefined,
    };
  }

  const level2Options = getLevel2Options(code, matchL1);
  const resolvedSub = resolveSubCounty(code, matchL1, subCounty);
  const matchL2 = resolvedSub
    ? level2Options.find((s) => s.toLowerCase() === resolvedSub.toLowerCase()) ?? (relaxed ? resolvedSub : null)
    : null;

  if (!matchL2) {
    if (relaxed) {
      return { valid: true, subCounty: subCounty.trim(), parish: parish?.trim() };
    }
    return {
      valid: false,
      error: `Invalid ${getCountryConfig(country)?.levelLabels[1] ?? 'sub-region'} for ${matchL1}`,
      suggestion: level2Options[0] ? `Did you mean "${level2Options[0]}"?` : undefined,
    };
  }

  if (parish?.trim()) {
    const level3Options = getLevel3Options(code, matchL1, matchL2);
    if (level3Options.length > 0) {
      const matchL3 = level3Options.find((p) => p.toLowerCase() === parish.toLowerCase());
      if (!matchL3 && !relaxed) {
        return {
          valid: false,
          error: `Invalid ${getCountryConfig(country)?.levelLabels[2] ?? 'area'} for ${matchL2}`,
          suggestion: level3Options[0] ? `Did you mean "${level3Options[0]}"?` : undefined,
        };
      }
      return { valid: true, subCounty: matchL2, parish: matchL3 ?? parish.trim() };
    }
  }

  return { valid: true, subCounty: matchL2, parish: parish?.trim() };
}

export function validateFarmerRow(
  input: FarmerInput,
  options: {
    existingPhones?: Set<string>;
    existingIdNumbers?: Set<string>;
    existingKeys?: Set<string>;
    membershipGroups?: string[];
    rowNumber?: number;
    /** Bulk import: auto-create unknown cooperatives, relax location matching */
    importMode?: boolean;
  } = {}
): ValidationResult {
  const importMode = options.importMode ?? false;
  const rowNumber = options.rowNumber ?? 0;
  const prepared = importMode ? preprocessImportRow(input, rowNumber) : input;
  const errors: FieldError[] = [];
  const normalized: Partial<FarmerInput> = {};

  const key = prepared.key?.trim();
  if (!key) {
    errors.push({ field: 'key', value: prepared.key ?? '', error: 'Key is required' });
  } else if (options.existingKeys?.has(key)) {
    errors.push({ field: 'key', value: key, error: 'Key already exists in system' });
  } else {
    normalized.key = key;
  }

  const name = prepared.name?.trim();
  if (!name || name.length < 2 || name.length > 100) {
    errors.push({
      field: 'name',
      value: prepared.name ?? '',
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

  const gender = normalizeGender(prepared.gender ?? '');
  if (!gender) {
    errors.push({
      field: 'gender',
      value: prepared.gender ?? '',
      error: 'Gender must be M, F, or Other',
    });
  } else {
    normalized.gender = gender;
  }

  const idNumber = prepared.idNumber?.trim();
  if (!idNumber || idNumber.length < 5 || idNumber.length > 50) {
    errors.push({
      field: 'idNumber',
      value: prepared.idNumber ?? '',
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

  const membershipGroup = prepared.membershipGroup?.trim();
  const groups = options.membershipGroups ?? [];
  if (!membershipGroup) {
    errors.push({
      field: 'membershipGroup',
      value: prepared.membershipGroup ?? '',
      error: 'Membership group is required',
    });
  } else if (groups.length > 0 && !groups.includes(membershipGroup)) {
    if (importMode) {
      normalized.membershipGroup = membershipGroup;
    } else {
      const suggestion = groups.find((g) =>
        g.toLowerCase().includes(membershipGroup.toLowerCase())
      );
      errors.push({
        field: 'membershipGroup',
        value: membershipGroup,
        error: `Membership group "${membershipGroup}" not found`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
      });
    }
  } else {
    normalized.membershipGroup = membershipGroup;
  }

  const country = prepared.country?.trim() || inferCountryFromRow(prepared) || 'Kenya';
  const countryConfig = getCountryConfig(country);
  if (!countryConfig) {
    errors.push({ field: 'country', value: country, error: `Country "${country}" is not supported` });
  } else {
    normalized.country = countryConfig.name;
  }

  const phone = normalizePhone(prepared.phone ?? '', country);
  if (!phone) {
    errors.push({
      field: 'phone',
      value: prepared.phone ?? '',
      error: countryConfig?.phoneError ?? 'Invalid phone number format',
      suggestion: countryConfig?.phoneExample,
    });
  } else if (options.existingPhones?.has(phone)) {
    errors.push({
      field: 'phone',
      value: prepared.phone ?? '',
      error: 'Phone number already exists in system',
    });
  } else {
    normalized.phone = phone;
  }

  const district = prepared.district?.trim();
  const subCounty = prepared.subCounty?.trim();
  if (!district || !subCounty) {
    if (!district) errors.push({ field: 'district', value: prepared.district ?? '', error: 'Location level 1 is required' });
    if (!subCounty) errors.push({ field: 'subCounty', value: prepared.subCounty ?? '', error: 'Location level 2 is required' });
  } else if (countryConfig) {
    const locCheck = validateRegionalLocation(country, district, subCounty, prepared.parish, importMode);
    if (!locCheck.valid) {
      errors.push({
        field: 'district',
        value: district,
        error: locCheck.error ?? 'Invalid location',
        suggestion: locCheck.suggestion,
      });
    } else {
      const code = getCountryCode(country)!;
      const l1 = getLevel1Options(code).find((d) => d.toLowerCase() === district.toLowerCase())!;
      const l2 = locCheck.subCounty ?? subCounty;
      normalized.district = l1;
      normalized.subCounty = l2;
      if (prepared.parish?.trim()) {
        normalized.parish = locCheck.parish ?? prepared.parish.trim();
      }
      normalized.locationPath = buildLocationPath(countryConfig.name, l1, l2, normalized.parish, prepared.village);
      if (phone) {
        normalized.kbFarmerId = generateFarmerId(new Date(), [l1, l2, normalized.parish ?? ''], phone);
      }
      if (!prepared.aggregationCenter?.trim()) {
        const centre = findAggregationCentre(countryConfig.name, l1, l2);
        if (centre) normalized.aggregationCenter = centre.name;
      }
    }
  }

  if (prepared.aggregationCenter?.trim() && !normalized.aggregationCenter) {
    normalized.aggregationCenter = prepared.aggregationCenter.trim();
  }

  if (prepared.parish?.trim() && !normalized.parish) normalized.parish = prepared.parish.trim();
  if (prepared.village?.trim()) normalized.village = prepared.village.trim();

  const membershipType = normalizeMembershipType(prepared.membershipType) ?? prepared.membershipType?.trim();
  if (membershipType && !(MEMBERSHIP_TYPES as readonly string[]).includes(membershipType)) {
    if (!importMode) {
      errors.push({
        field: 'membershipType',
        value: membershipType,
        error: 'Membership type must be Active, Inactive, or Suspended',
      });
    } else {
      normalized.membershipType = 'Active';
    }
  } else if (membershipType) {
    normalized.membershipType = membershipType;
  } else if (importMode) {
    normalized.membershipType = 'Active';
  }

  if (prepared.occupation?.trim()) {
    const occ = prepared.occupation.trim();
    if (occ.length < 2 || occ.length > 50) {
      errors.push({ field: 'occupation', value: occ, error: 'Occupation must be 2-50 characters' });
    } else {
      normalized.occupation = occ;
    }
  }

  if (prepared.sizeOfLand !== undefined && prepared.sizeOfLand !== '') {
    const size = typeof prepared.sizeOfLand === 'number' ? prepared.sizeOfLand : parseFloat(String(prepared.sizeOfLand));
    if (isNaN(size) || size < 0 || size > 1000) {
      errors.push({
        field: 'sizeOfLand',
        value: String(prepared.sizeOfLand),
        error: 'Size of land must be between 0-1000 acres',
      });
    } else {
      normalized.sizeOfLand = size;
    }
  }

  if (prepared.project1?.trim()) normalized.project1 = prepared.project1.trim();
  if (prepared.project2?.trim()) normalized.project2 = prepared.project2.trim();
  if (prepared.project3?.trim()) normalized.project3 = prepared.project3.trim();
  if (prepared.picture?.trim()) normalized.picture = prepared.picture.trim();

  return { valid: errors.length === 0, errors, normalized };
}

export function csvRowToFarmerInput(row: Record<string, string>): FarmerInput {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const val = row[key]?.trim();
      if (val) return val;
    }
    return '';
  };

  return {
    key: get('Key', 'S/N', 'SN', 'Serial'),
    name: get('Name'),
    gender: get('Gender', 'Sex', 'SEX'),
    idNumber: get('ID Number', 'ID', 'National ID'),
    membershipGroup: get(
      'Membership Group',
      'Memebrship Group',
      'Memebership Group',
      'NAMES OF GRPOPS',
      'NAMES OF GRPSOPS',
      'NAMES OF GROUPS',
      'Group Name'
    ),
    aggregationCenter: get('Aggregation center', 'Aggregation Centre'),
    phone: get('Phone', 'Phone Number', 'Mobile'),
    country: get('Country'),
    district: get('District'),
    subCounty: get('Sub-County', 'Sub County', 'Sub Coun', 'Subcounty'),
    parish: get('Parish'),
    village: get('Village', 'Venue'),
    membershipType: get('Membership Type', 'Membership'),
    occupation: get('Occupation'),
    sizeOfLand: get('Size of land', 'Land Size'),
    project1: get('Project 1'),
    project2: get('Project 2'),
    project3: get('Project 3'),
    picture: get('Picture', 'Photo'),
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
    Key: ['key', 'id', 'farmer_key', 'farmer id', 's/n', 'sn', 'serial', '#'],
    Name: ['name', 'full name', 'farmer name'],
    Gender: ['gender', 'sex'],
    'ID Number': ['id number', 'id_number', 'national id', 'national_id', 'id'],
    'Membership Group': [
      'membership group',
      'memebrship group',
      'memebership group',
      'cooperative',
      'coop',
      'membership_group',
      'names of grpops',
      'names of grpsops',
      'names of groups',
      'group name',
      'names of grpop',
    ],
    'Aggregation center': ['aggregation center', 'aggregation_center', 'aggregation centre', 'center'],
    Phone: ['phone', 'phone number', 'phone_number', 'mobile'],
    Country: ['country'],
    District: ['district', 'county'],
    'Sub-County': ['sub-county', 'sub county', 'sub_county', 'subcounty', 'sub coun'],
    Parish: ['parish'],
    Village: ['village', 'venue'],
    'Membership Type': ['membership type', 'membership_type', 'membership', 'status'],
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
