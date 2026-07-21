import { getCountryCode, REGIONAL_CONFIG, type CountryCode } from './regional';

/**
 * Generate unique farmer ID: DDMMYY + location initials (3 letters) + phone last 4
 * Example: 240324NMK5678 for Nyeri/Mathira East/Konyu, phone ending 5678
 */
export function generateFarmerId(
  registrationDate: Date | string,
  locationLevels: string[],
  phoneNumber: string
): string {
  const date = typeof registrationDate === 'string' ? new Date(registrationDate) : registrationDate;
  const datePart =
    String(date.getDate()).padStart(2, '0') +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getFullYear()).slice(-2);

  const locationInitials = locationLevels
    .filter((l) => l && l.trim())
    .slice(0, 3)
    .map((l) => l.trim().charAt(0).toUpperCase())
    .join('')
    .padEnd(3, 'X')
    .slice(0, 3);

  const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-4);

  return `${datePart}${locationInitials}${cleanPhone}`;
}

export function isValidFarmerId(id: string): boolean {
  return /^\d{6}[A-Z]{3,4}\d{4}$/.test(id);
}

const INTL_PREFIX: Record<CountryCode, string> = {
  kenya: '+254',
  uganda: '+256',
  tanzania: '+255',
  rwanda: '+250',
  burundi: '+257',
  southsudan: '+211',
  drc: '+243',
  somalia: '+252',
};

const LOCAL_LEN: Record<CountryCode, number> = {
  kenya: 9,
  uganda: 9,
  tanzania: 9,
  rwanda: 9,
  burundi: 8,
  southsudan: 9,
  drc: 9,
  somalia: 9,
};

export function normalizePhoneForCountry(phone: string, countryName: string): string | null {
  const code = getCountryCode(countryName);
  if (!code) return null;

  let cleaned = String(phone ?? '').trim();
  // Excel exports: ="0712345678" or '0712345678
  cleaned = cleaned.replace(/^=+/, '').replace(/^['"]+|['"]+$/g, '');
  cleaned = cleaned.replace(/[\s().\-]/g, '');

  const prefix = INTL_PREFIX[code];
  const callingCode = prefix.slice(1);
  const localLen = LOCAL_LEN[code];

  if (cleaned.startsWith(prefix) && cleaned.length === prefix.length + localLen) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length === localLen + 1) return prefix + cleaned.slice(1);
  if (/^[0-9]+$/.test(cleaned) && cleaned.length === localLen) return prefix + cleaned;
  // 254712345678 or 256756900324 without leading +
  if (/^[0-9]+$/.test(cleaned) && cleaned.startsWith(callingCode) && cleaned.length === callingCode.length + localLen) {
    return `+${cleaned}`;
  }

  return null;
}

export function validatePhoneForCountry(phone: string, countryName: string): boolean {
  const code = getCountryCode(countryName);
  if (!code) return false;
  const cleaned = phone.replace(/\s/g, '');
  return REGIONAL_CONFIG[code].phoneRegex.test(cleaned) || normalizePhoneForCountry(phone, countryName) !== null;
}

/** Legacy Kenya-only normalizer — kept for backward compatibility */
export function normalizePhoneKenya(phone: string): string | null {
  return normalizePhoneForCountry(phone, 'Kenya');
}
