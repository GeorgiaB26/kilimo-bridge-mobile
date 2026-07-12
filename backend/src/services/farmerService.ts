import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { FarmerInput } from '../../../shared/src/validation';
import { generateFarmerId } from '../../../shared/src/farmerId';
import { buildLocationPath, getCountryConfig } from '../../../shared/src/regional';
import { encryptField } from './encryptionService';
import { logAudit } from './auditService';
import { assignAggregationCentre } from './aggregationCentreService';
import { linkFarmerToUser } from './userService';

const PROJECT_PAYMENTS: Record<string, number> = {
  'Coffee Training': 15000,
  'Soil Health': 8000,
  'Baseline Survey': 5000,
  'Water Conservation': 12000,
  'Pest Management': 7000,
};

const DEFAULT_PROJECT_PAYMENT = 10000;

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

export function ensureMembershipGroup(name: string): string {
  const existing = getMembershipGroupIdByName(name);
  if (existing) return existing;
  const id = uuidv4();
  db.prepare('INSERT INTO membership_groups (id, name) VALUES (?, ?)').run(id, name);
  return id;
}

export function getProjectIdByName(name: string): string | null {
  const row = db.prepare('SELECT id FROM projects WHERE LOWER(name) = LOWER(?)').get(name.trim()) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

export function ensureProject(name: string): string {
  const existing = getProjectIdByName(name);
  if (existing) return existing;
  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, name.trim());
  return id;
}

export function enrollFarmerInProjects(
  farmerId: string,
  projectNames: Array<string | undefined | null>
): number {
  const unique = [...new Set(projectNames.map((p) => p?.trim()).filter(Boolean))] as string[];
  let enrolled = 0;
  const startDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const projectName of unique) {
    const projectId = ensureProject(projectName);
    const existing = db
      .prepare('SELECT id FROM farmer_projects WHERE farmer_id = ? AND project_id = ?')
      .get(farmerId, projectId);
    if (existing) continue;

    const paymentAmount = PROJECT_PAYMENTS[projectName] ?? DEFAULT_PROJECT_PAYMENT;
    db.prepare(`
      INSERT INTO farmer_projects (
        id, farmer_id, project_id, project_name, payment_amount, status,
        completion_percentage, earnings_amount, payment_status, start_date, due_date
      ) VALUES (?, ?, ?, ?, ?, 'Assigned', 0, ?, 'Pending', ?, ?)
    `).run(uuidv4(), farmerId, projectId, projectName, paymentAmount, paymentAmount, startDate, dueDate);
    enrolled++;
  }

  return enrolled;
}

/**
 * Create farmer profile, login account, and project enrollments from CSV import.
 */
export function importFarmerFromCsv(
  input: FarmerInput & { key: string; phone: string; kbFarmerId?: string; locationPath?: string },
  registeredBy?: string
): { farmerId: string; projectsEnrolled: number } {
  ensureMembershipGroup(input.membershipGroup);
  const farmerId = createFarmer(input, registeredBy);
  linkFarmerToUser(farmerId, input.phone, input.name);
  const projectsEnrolled = enrollFarmerInProjects(farmerId, [input.project1, input.project2, input.project3]);

  logAudit({
    userId: registeredBy,
    action: 'farmer.import',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: {
      key: input.key,
      phone: input.phone,
      projectsEnrolled,
      membershipGroup: input.membershipGroup,
    },
    success: true,
  });

  return { farmerId, projectsEnrolled };
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
  const aggregationCenter =
    assignAggregationCentre(country, input.district, input.subCounty, input.aggregationCenter) ?? null;

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
    aggregationCenter,
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
    details: { district: input.district, key: input.key, kbFarmerId, country, aggregationCenter },
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

export function getAllFarmers(limit = 100, offset = 0, country?: string) {
  if (country) {
    return db.prepare(`
      SELECT f.*, mg.name as membership_group_name
      FROM farmers f
      JOIN membership_groups mg ON f.membership_group_id = mg.id
      WHERE f.country = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `).all(country, limit, offset);
  }
  return db.prepare(`
    SELECT f.*, mg.name as membership_group_name
    FROM farmers f
    JOIN membership_groups mg ON f.membership_group_id = mg.id
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

export function getFarmerCount(country?: string): number {
  if (country) {
    const row = db.prepare('SELECT COUNT(*) as count FROM farmers WHERE country = ?').get(country) as { count: number };
    return row.count;
  }
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
