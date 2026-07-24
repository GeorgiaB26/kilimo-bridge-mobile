/**
 * Mobile re-exports from shared package (monorepo ../shared).
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
} from '../../shared/src/regional';

export { generateFarmerId, normalizePhoneForCountry, isValidFarmerId } from '../../shared/src/farmerId';

export { findAggregationCentre, getCentresForCountry } from '../../shared/src/locations/aggregationCentres';

export { PENDING_LOCATION_LABEL } from '../../shared/src/constants';
