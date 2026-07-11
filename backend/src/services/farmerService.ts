import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { FarmerInput } from '../../../shared/src/validation';
import { generateFarmerId } from '../../../shared/src/farmerId';
import { buildLocationPath, getCountryConfig } from '../../../shared/src/regional';
import { encryptField } from './encryptionService';
import { logAudit } from './auditService';

export function getMembershipGroupNames(): string[] {
  const rows = db.prepare('SELECT name FROM membership_groups ORDER BY name').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getMembershipGroupIdByName(name: string): string | null {
  const row = db.prepare('SELECT id FROM membership_groups WHERE name = ?').get(name) as { id: string } | undefined;
  return row?.id ?? null;
}

export function getExistingIdentifiers() {
  const phones = new Set(
    (db.prepare('SELECT phone_number FROM farmers').all() as { phone_number: string }[]).map((r) => r.phone_number)
  );
  const idNumbers = new Set(
    (db.prepare('SELECT id_number FROM farmers').all() as { id_number: string }[]).map((r) => r.id_number)
  );
  const keys = new Set(
    (db.prepare('SELECT key FROM farmers').all() as { key: string }[]).map((r) => r.key)
  );
  return { phones, idNumbers, keys };
}

export function createFarmer(
  input: FarmerInput & { key: string; phone: string; bankAccount?: string; kbFarmerId?: string; locationPath?: string },
  registeredBy?: string
): string {
  const farmerId = uuidv4();
  const groupId = getMembershipGroupIdByName(input.membershipGroup);
  if (!groupId) throw new Error(`Membership group not found: ${input.membershipGroup}`);

  const country = input.country ?? 'Kenya';
  const countryConfig = getCountryConfig(country);
  const kbFarmerId =
    input.kbFarmerId ??
    generateFarmerId(new Date(), [input.district, input.subCounty, input.parish ?? ''], input.phone);
  const locationPath =
    input.locationPath ??
    buildLocationPath(country, input.district, input.subCounty, input.parish, input.village);
  const phonePrefix = countryConfig?.phonePrefixes.find((p) => p.startsWith('+')) ?? '+254';

  const idNumberEncrypted = encryptField(input.idNumber);
  const bankAccountEncrypted = input.bankAccount ? encryptField(input.bankAccount) : null;

  db.prepare(`
    INSERT INTO farmers (
      farmer_id, key, name, gender, id_number, id_number_encrypted, bank_account_encrypted,
      membership_group_id, aggregation_center, phone_number, phone_country_prefix,
      country, district, sub_county, parish, village,
      location_level_1, location_level_2, location_level_3, location_level_4,
      location_path, kb_farmer_id,
      membership_type, occupation, size_of_land,
      picture_url, project_1, project_2, project_3, status, registered_by_agent_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    farmerId,
    input.key,
    input.name,
    input.gender,
    input.idNumber,
    idNumberEncrypted,
    bankAccountEncrypted,
    groupId,
    input.aggregationCenter ?? null,
    input.phone,
    phonePrefix,
    country,
    input.district,
    input.subCounty,
    input.parish ?? null,
    input.village ?? null,
    input.district,
    input.subCounty,
    input.parish ?? null,
    input.village ?? null,
    locationPath,
    kbFarmerId,
    input.membershipType ?? 'Active',
    input.occupation ?? null,
    input.sizeOfLand ?? null,
    input.picture ?? null,
    input.project1 ?? null,
    input.project2 ?? null,
    input.project3 ?? null,
    input.membershipType ?? 'Active',
    registeredBy ?? null
  );

  logAudit({
    userId: registeredBy,
    action: 'farmer.create',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { district: input.district, key: input.key, kbFarmerId, country },
    success: true,
  });

  return farmerId;
}

export function getFarmerByPhone(phone: string) {
  return db.prepare(`
    SELECT f.*, mg.name as membership_group_name
    FROM farmers f
    JOIN membership_groups mg ON f.membership_group_id = mg.id
    WHERE f.phone_number = ?
  `).get(phone);
}

export function getAllFarmers(limit = 100, offset = 0) {
  return db.prepare(`
    SELECT f.*, mg.name as membership_group_name
    FROM farmers f
    JOIN membership_groups mg ON f.membership_group_id = mg.id
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function getFarmerCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM farmers').get() as { count: number };
  return row.count;
}

export function getFarmerCountByCountry(): Record<string, number> {
  const rows = db
    .prepare('SELECT country, COUNT(*) as count FROM farmers GROUP BY country ORDER BY count DESC')
    .all() as { country: string; count: number }[];
  return Object.fromEntries(rows.map((r) => [r.country, r.count]));
}

export function generateFarmerKey(): string {
  const count = getFarmerCount();
  return `KB-${String(count + 1).padStart(5, '0')}`;
}
