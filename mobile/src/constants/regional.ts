/**
 * Mobile re-exports from shared package.
 * Import from here (not ../../../../shared) so Metro resolves reliably.
 */
export {
  COUNTRY_LIST,
  REGIONAL_CONFIG,
  getCountryConfig,
  getCountryCode,
  getLevel1Options,
  getLevel2Options,
  getLevel3Options,
  buildLocationPath,
} from '../../../shared/src/regional';

export { generateFarmerId, normalizePhoneForCountry, isValidFarmerId } from '../../../shared/src/farmerId';

export { findAggregationCentre, getCentresForCountry } from '../../../shared/src/locations/aggregationCentres';
