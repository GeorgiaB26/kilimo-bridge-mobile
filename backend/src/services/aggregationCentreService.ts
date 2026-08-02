import { query, queryOne } from '../db/database';
import { AGGREGATION_CENTRES, findAggregationCentre } from '../../../shared/src/locations/aggregationCentres';

export interface AggregationCentreRow {
  centre_id: string;
  name: string;
  country: string;
  location_level_1: string;
  location_level_2: string | null;
  region: string | null;
  status: string;
}

export async function seedAggregationCentres(): Promise<void> {
  for (const centre of AGGREGATION_CENTRES) {
    await query(
      `INSERT INTO aggregation_centres (
        centre_id, name, country, location_level_1, location_level_2, region, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'Active')
      ON CONFLICT (centre_id) DO NOTHING`,
      [
        centre.id,
        centre.name,
        centre.country,
        centre.locationLevel1,
        centre.locationLevel2 ?? null,
        centre.region ?? null,
      ]
    );
  }
}

export async function assignAggregationCentre(
  country: string,
  level1: string,
  level2?: string,
  explicit?: string
): Promise<string | null> {
  if (explicit?.trim()) return explicit.trim();

  const fromDb = await queryOne<{ name: string }>(
    `
    SELECT name FROM aggregation_centres
    WHERE country = $1 AND lower(location_level_1) = lower($2)
      AND ($3::text IS NULL OR location_level_2 IS NULL OR lower(location_level_2) = lower($3::text))
    ORDER BY location_level_2 IS NOT NULL DESC
    LIMIT 1
  `,
    [country, level1, level2 ?? null]
  );

  if (fromDb) return fromDb.name;

  const fallback = findAggregationCentre(country, level1, level2);
  return fallback?.name ?? null;
}

export async function getAllAggregationCentres(country?: string): Promise<AggregationCentreRow[]> {
  if (country) {
    return query<AggregationCentreRow>(
      `SELECT * FROM aggregation_centres WHERE country = $1 AND status = 'Active' ORDER BY location_level_1, name`,
      [country]
    );
  }
  return query<AggregationCentreRow>(
    `SELECT * FROM aggregation_centres WHERE status = 'Active' ORDER BY country, location_level_1`
  );
}

/** Filter centres by country + county/district + optional sub-county for registration dropdown. */
export async function findAggregationCentresByLocation(
  country: string,
  county: string,
  subcounty?: string
): Promise<AggregationCentreRow[]> {
  const sub = subcounty?.trim() || null;
  const rows = await query<AggregationCentreRow>(
    `
    SELECT * FROM aggregation_centres
    WHERE country = $1 AND status = 'Active'
      AND lower(location_level_1) = lower($2)
      AND (
        $3::text IS NULL
        OR location_level_2 IS NULL
        OR lower(location_level_2) = lower($3::text)
      )
    ORDER BY
      CASE WHEN $3::text IS NOT NULL AND lower(location_level_2) = lower($3::text) THEN 0 ELSE 1 END,
      name
    `,
    [country, county, sub]
  );
  if (rows.length > 0) return rows;

  return query<AggregationCentreRow>(
    `
    SELECT * FROM aggregation_centres
    WHERE country = $1 AND status = 'Active' AND lower(location_level_1) = lower($2)
    ORDER BY name
    `,
    [country, county]
  );
}

export async function getCentreCountByCountry(): Promise<Record<string, number>> {
  const rows = await query<{ country: string; count: number }>(
    `SELECT country, COUNT(*)::int AS count FROM aggregation_centres WHERE status = 'Active' GROUP BY country`
  );
  return Object.fromEntries(rows.map((r) => [r.country, r.count]));
}
