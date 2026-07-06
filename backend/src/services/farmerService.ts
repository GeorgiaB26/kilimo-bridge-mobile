import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { FarmerInput } from '../../../shared/src/validation';

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

export function createFarmer(input: FarmerInput & { key: string; phone: string }): string {
  const farmerId = uuidv4();
  const groupId = getMembershipGroupIdByName(input.membershipGroup);
  if (!groupId) throw new Error(`Membership group not found: ${input.membershipGroup}`);

  db.prepare(`
    INSERT INTO farmers (
      farmer_id, key, name, gender, id_number, membership_group_id,
      aggregation_center, phone_number, country, district, sub_county,
      parish, village, membership_type, occupation, size_of_land,
      picture_url, project_1, project_2, project_3, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    farmerId,
    input.key,
    input.name,
    input.gender,
    input.idNumber,
    groupId,
    input.aggregationCenter ?? null,
    input.phone,
    input.country ?? 'Kenya',
    input.district,
    input.subCounty,
    input.parish ?? null,
    input.village ?? null,
    input.membershipType ?? 'Active',
    input.occupation ?? null,
    input.sizeOfLand ?? null,
    input.picture ?? null,
    input.project1 ?? null,
    input.project2 ?? null,
    input.project3 ?? null,
    input.membershipType ?? 'Active'
  );

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

export function generateFarmerKey(): string {
  const count = getFarmerCount();
  return `KB-${String(count + 1).padStart(5, '0')}`;
}
