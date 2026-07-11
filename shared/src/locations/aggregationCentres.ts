export interface AggregationCentre {
  id: string;
  name: string;
  country: string;
  locationLevel1: string;
  locationLevel2?: string;
  region?: string;
}

/** Seed aggregation centres mapped to counties (Kenya) and districts (Uganda) */
export const AGGREGATION_CENTRES: AggregationCentre[] = [
  // Kenya — major counties
  { id: 'ke-kiambu-01', name: 'Kiambu Town Hall', country: 'Kenya', locationLevel1: 'Kiambu', region: 'Central' },
  { id: 'ke-kiambu-02', name: 'Thika Aggregation Hub', country: 'Kenya', locationLevel1: 'Kiambu', locationLevel2: 'Thika', region: 'Central' },
  { id: 'ke-nyeri-01', name: 'Nyeri Town Centre', country: 'Kenya', locationLevel1: 'Nyeri', region: 'Central' },
  { id: 'ke-nairobi-01', name: 'Nairobi Westlands Hub', country: 'Kenya', locationLevel1: 'Nairobi', region: 'Nairobi' },
  { id: 'ke-nairobi-02', name: 'Embakasi Collection Point', country: 'Kenya', locationLevel1: 'Nairobi', locationLevel2: 'Embakasi', region: 'Nairobi' },
  { id: 'ke-nakuru-01', name: 'Nakuru Farmers Centre', country: 'Kenya', locationLevel1: 'Nakuru', region: 'Rift Valley' },
  { id: 'ke-kisumu-01', name: 'Kisumu Lake Hub', country: 'Kenya', locationLevel1: 'Kisumu', region: 'Nyanza' },
  { id: 'ke-mombasa-01', name: 'Mombasa Port Centre', country: 'Kenya', locationLevel1: 'Mombasa', region: 'Coast' },
  { id: 'ke-eldoret-01', name: 'Eldoret Grain Centre', country: 'Kenya', locationLevel1: 'Uasin Gishu', region: 'Rift Valley' },
  { id: 'ke-kilifi-01', name: 'Kilifi Coastal Hub', country: 'Kenya', locationLevel1: 'Kilifi', region: 'Coast' },
  { id: 'ke-meru-01', name: 'Meru Agricultural Centre', country: 'Kenya', locationLevel1: 'Meru', region: 'Eastern' },
  { id: 'ke-kakamega-01', name: 'Kakamega Produce Hub', country: 'Kenya', locationLevel1: 'Kakamega', region: 'Western' },
  { id: 'ke-machakos-01', name: 'Machakos Collection Centre', country: 'Kenya', locationLevel1: 'Machakos', region: 'Eastern' },
  { id: 'ke-kajiado-01', name: 'Kajiado Livestock Centre', country: 'Kenya', locationLevel1: 'Kajiado', region: 'Rift Valley' },
  { id: 'ke-bungoma-01', name: 'Bungoma Maize Hub', country: 'Kenya', locationLevel1: 'Bungoma', region: 'Western' },
  { id: 'ke-turkana-01', name: 'Lodwar Aggregation Point', country: 'Kenya', locationLevel1: 'Turkana', region: 'Rift Valley' },
  { id: 'ke-kwale-01', name: 'Kwale Coastal Centre', country: 'Kenya', locationLevel1: 'Kwale', region: 'Coast' },
  { id: 'ke-kericho-01', name: 'Kericho Tea Centre', country: 'Kenya', locationLevel1: 'Kericho', region: 'Rift Valley' },
  { id: 'ke-garissa-01', name: 'Garissa Regional Hub', country: 'Kenya', locationLevel1: 'Garissa', region: 'North Eastern' },
  { id: 'ke-kitui-01', name: 'Kitui Farmers Centre', country: 'Kenya', locationLevel1: 'Kitui', region: 'Eastern' },

  // Uganda — major districts
  { id: 'ug-gulu-01', name: 'Gulu Centre', country: 'Uganda', locationLevel1: 'Gulu', region: 'Northern' },
  { id: 'ug-gulu-02', name: 'Gulu Women Dev Centre', country: 'Uganda', locationLevel1: 'Gulu', locationLevel2: 'Central', region: 'Northern' },
  { id: 'ug-kampala-01', name: 'Kampala Central Hub', country: 'Uganda', locationLevel1: 'Kampala', region: 'Central' },
  { id: 'ug-kampala-02', name: 'Nakawa Collection Point', country: 'Uganda', locationLevel1: 'Kampala', locationLevel2: 'Nakawa', region: 'Central' },
  { id: 'ug-mbarara-01', name: 'Mbarara Farmers Centre', country: 'Uganda', locationLevel1: 'Mbarara', region: 'Western' },
  { id: 'ug-wakiso-01', name: 'Entebbe Aggregation Hub', country: 'Uganda', locationLevel1: 'Wakiso', region: 'Central' },
  { id: 'ug-jinja-01', name: 'Jinja Nile Centre', country: 'Uganda', locationLevel1: 'Jinja', region: 'Eastern' },
  { id: 'ug-mbale-01', name: 'Mbale Eastern Hub', country: 'Uganda', locationLevel1: 'Mbale', region: 'Eastern' },
  { id: 'ug-lira-01', name: 'Lira Northern Centre', country: 'Uganda', locationLevel1: 'Lira', region: 'Northern' },
  { id: 'ug-mukono-01', name: 'Mukono Collection Centre', country: 'Uganda', locationLevel1: 'Mukono', region: 'Central' },
  { id: 'ug-masaka-01', name: 'Masaka Southern Hub', country: 'Uganda', locationLevel1: 'Masaka', region: 'Central' },
  { id: 'ug-hoima-01', name: 'Hoima Oil Belt Centre', country: 'Uganda', locationLevel1: 'Hoima', region: 'Western' },
  { id: 'ug-arua-01', name: 'Arua West Nile Hub', country: 'Uganda', locationLevel1: 'Arua', region: 'Northern' },
  { id: 'ug-soroti-01', name: 'Soroti Teso Centre', country: 'Uganda', locationLevel1: 'Soroti', region: 'Eastern' },
  { id: 'ug-kabale-01', name: 'Kabale Highland Hub', country: 'Uganda', locationLevel1: 'Kabale', region: 'Western' },
  { id: 'ug-tororo-01', name: 'Tororo Border Centre', country: 'Uganda', locationLevel1: 'Tororo', region: 'Eastern' },
  { id: 'ug-iganga-01', name: 'Iganga Busoga Hub', country: 'Uganda', locationLevel1: 'Iganga', region: 'Eastern' },
  { id: 'ug-masindi-01', name: 'Masindi Bunyoro Centre', country: 'Uganda', locationLevel1: 'Masindi', region: 'Western' },
];

/**
 * Find the best aggregation centre for a farmer's location.
 * Prefers exact level-2 match, then level-1, then any centre in the country.
 */
export function findAggregationCentre(
  country: string,
  level1: string,
  level2?: string
): AggregationCentre | null {
  const countryNorm = country.trim().toLowerCase();
  const l1Norm = level1.trim().toLowerCase();
  const l2Norm = level2?.trim().toLowerCase();

  const inCountry = AGGREGATION_CENTRES.filter((c) => c.country.toLowerCase() === countryNorm);

  if (l2Norm) {
    const exact = inCountry.find(
      (c) =>
        c.locationLevel1.toLowerCase() === l1Norm &&
        c.locationLevel2?.toLowerCase() === l2Norm
    );
    if (exact) return exact;
  }

  const level1Match = inCountry.find((c) => c.locationLevel1.toLowerCase() === l1Norm);
  if (level1Match) return level1Match;

  return inCountry[0] ?? null;
}

export function getCentresForCountry(country: string): AggregationCentre[] {
  const norm = country.trim().toLowerCase();
  return AGGREGATION_CENTRES.filter((c) => c.country.toLowerCase() === norm);
}
