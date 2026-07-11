import { db } from '../db/database';
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

export function seedAggregationCentres(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO aggregation_centres (
      centre_id, name, country, location_level_1, location_level_2, region, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'Active')
  `);

  for (const centre of AGGREGATION_CENTRES) {
    insert.run(
      centre.id,
      centre.name,
      centre.country,
      centre.locationLevel1,
      centre.locationLevel2 ?? null,
      centre.region ?? null
    );
  }
}

export function assignAggregationCentre(
  country: string,
  level1: string,
  level2?: string,
  explicit?: string
): string | null {
  if (explicit?.trim()) return explicit.trim();

  const fromDb = db
    .prepare(
      `
    SELECT name FROM aggregation_centres
    WHERE country = ? AND lower(location_level_1) = lower(?)
      AND (? IS NULL OR location_level_2 IS NULL OR lower(location_level_2) = lower(?))
    ORDER BY location_level_2 IS NOT NULL DESC
    LIMIT 1
  `
    )
    .get(country, level1, level2 ?? null, level2 ?? null) as { name: string } | undefined;

  if (fromDb) return fromDb.name;

  const fallback = findAggregationCentre(country, level1, level2);
  return fallback?.name ?? null;
}

export function getAllAggregationCentres(country?: string): AggregationCentreRow[] {
  if (country) {
    return db
      .prepare(
        `SELECT * FROM aggregation_centres WHERE country = ? AND status = 'Active' ORDER BY location_level_1, name`
      )
      .all(country) as AggregationCentreRow[];
  }
  return db
    .prepare(`SELECT * FROM aggregation_centres WHERE status = 'Active' ORDER BY country, location_level_1`)
    .all() as AggregationCentreRow[];
}

export function getCentreCountByCountry(): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT country, COUNT(*) as count FROM aggregation_centres WHERE status = 'Active' GROUP BY country`
    )
    .all() as { country: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.country, r.count]));
}
