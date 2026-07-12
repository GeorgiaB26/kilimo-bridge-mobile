export interface CurrencyInfo {
  code: string;
  symbol: string;
  locale: string;
  name: string;
}

/** Country name → currency (East Africa + extension countries) */
export const COUNTRY_CURRENCY_MAP: Record<string, CurrencyInfo> = {
  Kenya: { code: 'KES', symbol: 'KES', locale: 'en-KE', name: 'Kenyan Shilling' },
  Uganda: { code: 'UGX', symbol: 'UGX', locale: 'en-UG', name: 'Uganda Shilling' },
  Tanzania: { code: 'TZS', symbol: 'TZS', locale: 'en-TZ', name: 'Tanzanian Shilling' },
  Rwanda: { code: 'RWF', symbol: 'RWF', locale: 'en-RW', name: 'Rwanda Franc' },
  Burundi: { code: 'BIF', symbol: 'BIF', locale: 'fr-BI', name: 'Burundian Franc' },
  'Democratic Republic of Congo': { code: 'CDF', symbol: 'CDF', locale: 'fr-CD', name: 'Congolese Franc' },
  'South Sudan': { code: 'SSP', symbol: 'SSP', locale: 'en-SS', name: 'South Sudanese Pound' },
  Somalia: { code: 'SOS', symbol: 'SOS', locale: 'so-SO', name: 'Somali Shilling' },
  Ethiopia: { code: 'ETB', symbol: 'ETB', locale: 'en-ET', name: 'Ethiopian Birr' },
  Zambia: { code: 'ZMW', symbol: 'ZMW', locale: 'en-ZM', name: 'Zambian Kwacha' },
  Malawi: { code: 'MWK', symbol: 'MWK', locale: 'en-MW', name: 'Malawian Kwacha' },
  Mozambique: { code: 'MZN', symbol: 'MZN', locale: 'pt-MZ', name: 'Mozambique Metical' },
};

export const DEFAULT_COUNTRY = 'Kenya';

export function getCurrencyForCountry(countryName: string | null | undefined): CurrencyInfo {
  if (!countryName) return COUNTRY_CURRENCY_MAP[DEFAULT_COUNTRY];
  return COUNTRY_CURRENCY_MAP[countryName] ?? COUNTRY_CURRENCY_MAP[DEFAULT_COUNTRY];
}

/** Locale-aware currency formatting; falls back to "1,234 KES" style */
export function formatCurrency(amount: number, currencyCode: string, locale: string): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
    // Prefer "5,000 KES" style when Intl uses local symbols (e.g. Ksh)
    if (formatted.includes(currencyCode)) return formatted;
    return `${value.toLocaleString(locale)} ${currencyCode}`;
  } catch {
    return `${value.toLocaleString()} ${currencyCode}`;
  }
}

export function formatCurrencyForCountry(amount: number, countryName: string): string {
  const info = getCurrencyForCountry(countryName);
  return formatCurrency(amount, info.code, info.locale);
}
