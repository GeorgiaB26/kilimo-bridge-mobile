import { KENYA_LOCATIONS } from './locations/kenya';
import { UGANDA_LOCATIONS } from './locations/uganda';

export type CountryCode =
  | 'kenya'
  | 'uganda'
  | 'tanzania'
  | 'rwanda'
  | 'burundi'
  | 'southsudan'
  | 'drc'
  | 'somalia';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  hierarchy: string[];
  levelLabels: string[];
  idPrefix: string;
  phonePrefixes: string[];
  phoneRegex: RegExp;
  phoneExample: string;
  phoneError: string;
}

export const REGIONAL_CONFIG: Record<CountryCode, CountryConfig> = {
  kenya: {
    code: 'kenya',
    name: 'Kenya',
    hierarchy: ['country', 'county', 'subcounty', 'ward', 'village'],
    levelLabels: ['County', 'Sub-County', 'Ward', 'Village'],
    idPrefix: 'KE',
    phonePrefixes: ['+254', '0'],
    phoneRegex: /^(\+254|0)[0-9]{9}$/,
    phoneExample: '+254712345678 or 0712345678',
    phoneError: 'Kenya phone must start with +254 or 0 followed by 9 digits',
  },
  uganda: {
    code: 'uganda',
    name: 'Uganda',
    hierarchy: ['country', 'district', 'subcounty', 'parish', 'village'],
    levelLabels: ['District', 'Sub-County', 'Parish', 'Village'],
    idPrefix: 'UG',
    phonePrefixes: ['+256', '0'],
    phoneRegex: /^(\+256|0)[0-9]{9}$/,
    phoneExample: '+256701234567 or 0701234567',
    phoneError: 'Uganda phone must start with +256 or 0 followed by 9 digits',
  },
  tanzania: {
    code: 'tanzania',
    name: 'Tanzania',
    hierarchy: ['country', 'region', 'district', 'ward', 'village'],
    levelLabels: ['Region', 'District', 'Ward', 'Village'],
    idPrefix: 'TZ',
    phonePrefixes: ['+255', '0'],
    phoneRegex: /^(\+255|0)[0-9]{9}$/,
    phoneExample: '+255712345678 or 0712345678',
    phoneError: 'Tanzania phone must start with +255 or 0 followed by 9 digits',
  },
  rwanda: {
    code: 'rwanda',
    name: 'Rwanda',
    hierarchy: ['country', 'province', 'district', 'sector', 'cell'],
    levelLabels: ['Province', 'District', 'Sector', 'Cell'],
    idPrefix: 'RW',
    phonePrefixes: ['+250', '0'],
    phoneRegex: /^(\+250|0)[0-9]{9}$/,
    phoneExample: '+250781234567 or 0781234567',
    phoneError: 'Rwanda phone must start with +250 or 0 followed by 9 digits',
  },
  burundi: {
    code: 'burundi',
    name: 'Burundi',
    hierarchy: ['country', 'province', 'district', 'commune', 'hill'],
    levelLabels: ['Province', 'District', 'Commune', 'Hill'],
    idPrefix: 'BI',
    phonePrefixes: ['+257', '0'],
    phoneRegex: /^(\+257|0)[0-9]{8}$/,
    phoneExample: '+25779123456 or 079123456',
    phoneError: 'Burundi phone must start with +257 or 0 followed by 8 digits',
  },
  southsudan: {
    code: 'southsudan',
    name: 'South Sudan',
    hierarchy: ['country', 'state', 'county', 'payam', 'boma'],
    levelLabels: ['State', 'County', 'Payam', 'Boma'],
    idPrefix: 'SS',
    phonePrefixes: ['+211', '0'],
    phoneRegex: /^(\+211|0)[0-9]{9}$/,
    phoneExample: '+211912345678 or 0912345678',
    phoneError: 'South Sudan phone must start with +211 or 0 followed by 9 digits',
  },
  drc: {
    code: 'drc',
    name: 'Democratic Republic of Congo',
    hierarchy: ['country', 'province', 'district', 'territory', 'groupement'],
    levelLabels: ['Province', 'District', 'Territory', 'Groupement'],
    idPrefix: 'CD',
    phonePrefixes: ['+243', '0'],
    phoneRegex: /^(\+243|0)[0-9]{9}$/,
    phoneExample: '+243812345678 or 0812345678',
    phoneError: 'DRC phone must start with +243 or 0 followed by 9 digits',
  },
  somalia: {
    code: 'somalia',
    name: 'Somalia',
    hierarchy: ['country', 'region', 'district', 'zone', 'area'],
    levelLabels: ['Region', 'District', 'Zone', 'Area'],
    idPrefix: 'SO',
    phonePrefixes: ['+252', '0'],
    phoneRegex: /^(\+252|0)[0-9]{8,9}$/,
    phoneExample: '+252612345678 or 0612345678',
    phoneError: 'Somalia phone must start with +252 or 0 followed by 8-9 digits',
  },
};

export const COUNTRY_LIST = Object.values(REGIONAL_CONFIG);

/** Nested location data: level1 -> level2 -> level3 options */
export const LOCATION_DATA: Record<CountryCode, Record<string, Record<string, string[]>>> = {
  kenya: KENYA_LOCATIONS,
  uganda: UGANDA_LOCATIONS,
  tanzania: {
    'Dar es Salaam': {
      Ilala: ['Kariakoo', 'Buguruni', 'Gerezani'],
      Kinondoni: ['Msasani', 'Mikocheni', 'Kawe'],
    },
    Arusha: {
      Arusha: ['Sekei', 'Ngarenaro'],
    },
  },
  rwanda: {
    Kigali: {
      Gasabo: ['Ndera', 'Kimironko', 'Kacyiru'],
      Nyarugenge: ['Muhima', 'Gitega'],
    },
  },
  burundi: {
    'Bujumbura Mairie': {
      Bujumbura: ['Muha', 'Ntahangwa', 'Mukaza'],
    },
  },
  southsudan: {
    'Central Equatoria': {
      Juba: ['Rejaf', 'Kator', 'Munuki'],
    },
  },
  drc: {
    Kasai: {
      Kasai: ['Tshikaji', 'Bushimay'],
    },
  },
  somalia: {
    Mogadishu: {
      Hamar: ['HamarWeyne', 'Shangani', 'Bondhere'],
    },
  },
};

export function getCountryCode(countryName: string): CountryCode | null {
  const normalized = countryName.trim().toLowerCase();
  const found = COUNTRY_LIST.find((c) => c.name.toLowerCase() === normalized || c.code === normalized);
  return found?.code ?? null;
}

export function getCountryConfig(countryName: string): CountryConfig | null {
  const code = getCountryCode(countryName);
  return code ? REGIONAL_CONFIG[code] : null;
}

export function getLevel1Options(countryCode: CountryCode): string[] {
  return Object.keys(LOCATION_DATA[countryCode] ?? {}).sort();
}

export function getLevel2Options(countryCode: CountryCode, level1: string): string[] {
  const data = LOCATION_DATA[countryCode]?.[level1];
  return data ? Object.keys(data).sort() : [];
}

export function getLevel3Options(countryCode: CountryCode, level1: string, level2: string): string[] {
  return LOCATION_DATA[countryCode]?.[level1]?.[level2] ?? [];
}

export function buildLocationPath(country: string, ...levels: (string | undefined)[]): string {
  return [country, ...levels.filter(Boolean)].join('/');
}
