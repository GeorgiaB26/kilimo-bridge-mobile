/**
 * Per-country settings for the Equity SFTP batch CSV generator.
 *
 * Kenya keeps its historical behaviour (KES, MPESA, sequence-number filenames,
 * entity code supplied by the caller). Uganda follows the format Equity accepted in UAT.
 */

export type EquityCountry = 'UG' | 'KE';

export type EquityFilenameStyle = 'sequence' | 'timestamp';

export type EquityCountryConfig = {
  country: EquityCountry;
  currency: string;
  /**
   * Entity code used in the file name. `null` for Kenya: the caller supplies it
   * (EQUITY_SFTP_ENTITY_CODE) exactly as before.
   */
  entityCode: string | null;
  filenameStyle: EquityFilenameStyle;
  /** Customer Reference No prefix. `null` = legacy opaque reference (Kenya). */
  referencePrefix: string | null;
  /** Fixed Service Provider for every row. `null` = decided per row (Uganda, by network). */
  fixedServiceProvider: string | null;
};

export const EQUITY_UG_DEFAULT_ENTITY_CODE = 'DRAPIUSUG';

export function getEquityCountryConfig(country: EquityCountry): EquityCountryConfig {
  switch (country) {
    case 'UG':
      return {
        country: 'UG',
        currency: 'UGX',
        entityCode: process.env.EQUITY_UG_ENTITY_CODE?.trim() || EQUITY_UG_DEFAULT_ENTITY_CODE,
        filenameStyle: 'timestamp',
        referencePrefix: 'DU',
        fixedServiceProvider: null,
      };
    case 'KE':
      return {
        country: 'KE',
        currency: 'KES',
        entityCode: null,
        filenameStyle: 'sequence',
        referencePrefix: null,
        fixedServiceProvider: 'MPESA',
      };
    default: {
      const unsupported: never = country;
      throw new Error(`Unsupported Equity country: ${String(unsupported)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Uganda mobile network → Equity Service Provider
// ---------------------------------------------------------------------------

/**
 * Uganda 3-digit local prefix (including leading zero) → Equity Service Provider.
 * confirm with Equity
 */
export const UGANDA_MOBILE_PREFIX_PROVIDERS: Readonly<Record<string, string>> = {
  // Airtel
  '070': 'AIRTELMONEY-UG',
  '074': 'AIRTELMONEY-UG',
  '075': 'AIRTELMONEY-UG',
  // MTN
  '076': 'MTNUG',
  '077': 'MTNUG',
  '078': 'MTNUG',
};

/**
 * Normalise a Uganda mobile to the 10-digit local form with leading zero
 * (e.g. 0751000000). Accepts +256751000000, 256751000000, 0751000000, 751000000.
 */
export function normalizeUgandaMobile(input: string): string {
  const digits = input.replace(/\D/g, '');
  let national: string;
  if (digits.startsWith('256')) {
    national = digits.slice(3);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }
  if (!/^\d{9}$/.test(national)) {
    throw new Error(
      `Invalid Uganda mobile number "${input}": expected 9 digits after the country code or leading zero, got ${national.length}`
    );
  }
  return `0${national}`;
}

/** Equity Service Provider for a Uganda mobile, from its network prefix. */
export function getUgandaServiceProvider(localMobile: string): string {
  const normalized = normalizeUgandaMobile(localMobile);
  const prefix = normalized.slice(0, 3);
  const provider = UGANDA_MOBILE_PREFIX_PROVIDERS[prefix];
  if (!provider) {
    throw new Error(
      `Unknown Uganda mobile network prefix "${prefix}" for ${normalized}; supported prefixes: ${Object.keys(
        UGANDA_MOBILE_PREFIX_PROVIDERS
      ).join(', ')}`
    );
  }
  return provider;
}

// ---------------------------------------------------------------------------
// East Africa time (Africa/Kampala, UTC+3, no DST)
// ---------------------------------------------------------------------------

export const EAST_AFRICA_TIME_ZONE = 'Africa/Kampala';

export type EastAfricaTimeParts = {
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
};

const kampalaFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: EAST_AFRICA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Calendar/clock fields of `date` in Africa/Kampala, independent of the server time zone. */
export function getEastAfricaTimeParts(date: Date): EastAfricaTimeParts {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid Date passed to getEastAfricaTimeParts');
  }
  const values: Record<string, number> = {};
  for (const part of kampalaFormatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    day: values.day,
    month: values.month,
    year: values.year,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}
