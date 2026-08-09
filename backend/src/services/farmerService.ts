import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/database';
import type { FarmerInput } from '../../../shared/src/validation';
import { generateFarmerId } from '../../../shared/src/farmerId';
import { buildLocationPath, getCountryConfig, getCountryCode, getLevel1Options, getLevel2Options, getLevel3Options } from '../../../shared/src/regional';
import { validateRegionalLocation } from '../../../shared/src/validation';
import { encryptField, hashIdNumber, decryptField, isEncrypted } from './encryptionService';
import { logAudit } from './auditService';
import { assignAggregationCentre } from './aggregationCentreService';
import { linkFarmerToUser } from './userService';
import { PENDING_LOCATION_LABEL } from '../../../shared/src/constants';
import { enrollFarmerInProgramProjects, getFarmerProjectSummaries } from './farmerProgramService';
import { isOwnFarmerProfilePhotoKey, resolvePhotoUrlForDisplay } from './r2StorageService';
import { validateFarmerPhotoRequired } from '../../../shared/src/farmerPhoto';

/** Postgres farmer_status enum — agent field registrations await PM review. */
function mapFarmerStatus(_membershipType?: string, registeredByAgent?: boolean): string {
  if (registeredByAgent) return 'pending_review';
  return 'verified';
}

export async function getMembershipGroupNames(): Promise<string[]> {
  const rows = await query<{ name: string }>('SELECT name FROM membership_groups ORDER BY name');
  return rows.map((r) => r.name);
}

export async function getMembershipGroupIdByName(name: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM membership_groups WHERE name = $1',
    [name]
  );
  return row?.id ?? null;
}

export async function backfillLegacyIdNumberHashes(): Promise<number> {
  const rows = await query<{ farmer_id: string; id_number_encrypted: string }>(
    `SELECT farmer_id, id_number_encrypted FROM farmers
     WHERE id_number_hash IS NULL AND id_number_encrypted IS NOT NULL AND id_number_encrypted <> ''`
  );
  let updated = 0;
  for (const row of rows) {
    const plaintext = isEncrypted(row.id_number_encrypted)
      ? decryptField(row.id_number_encrypted)
      : row.id_number_encrypted;
    if (!plaintext?.trim()) continue;
    const idHash = hashIdNumber(plaintext);
    const idEncrypted = isEncrypted(row.id_number_encrypted) ? row.id_number_encrypted : encryptField(plaintext);
    try {
      await query(
        `UPDATE farmers SET id_number_hash = $1, id_number_encrypted = $2, updated_at = NOW()
         WHERE farmer_id = $3 AND id_number_hash IS NULL`,
        [idHash, idEncrypted, row.farmer_id]
      );
      updated++;
    } catch {
      console.warn(`Skipped id_number_hash backfill for farmer ${row.farmer_id} — hash may already exist`);
    }
  }
  return updated;
}

export async function getExistingIdentifiers() {
  const phoneRows = await query<{ phone_number: string }>('SELECT phone_number FROM farmers');
  const keyRows = await query<{ key: string }>('SELECT key FROM farmers');
  const idHashRows = await query<{ id_number_hash: string }>(
    'SELECT id_number_hash FROM farmers WHERE id_number_hash IS NOT NULL'
  );
  return {
    phones: new Set(phoneRows.map((r) => r.phone_number)),
    idNumberHashes: new Set(idHashRows.map((r) => r.id_number_hash)),
    keys: new Set(keyRows.map((r) => r.key)),
  };
}

export async function ensureMembershipGroup(name: string): Promise<string> {
  const existing = await getMembershipGroupIdByName(name);
  if (existing) return existing;
  const id = uuidv4();
  await query(
    'INSERT INTO membership_groups (id, name) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [id, name]
  );
  return (await getMembershipGroupIdByName(name)) ?? id;
}

/** Enroll farmer in program_projects by name (CSV Project 1/2/3 columns). */
export async function enrollFarmerInProjects(
  farmerId: string,
  projectNames: Array<string | undefined | null>
): Promise<number> {
  return enrollFarmerInProgramProjects(farmerId, projectNames);
}

export {
  findProgramProjectIdByName as getProjectIdByName,
  ensureProgramProjectByName as ensureProject,
} from './farmerProgramService';

/**
 * Create farmer profile, login account, and project enrollments from CSV import.
 */
export async function importFarmerFromCsv(
  input: FarmerInput & { key: string; phone: string; kbFarmerId?: string; locationPath?: string },
  registeredBy?: string
): Promise<{ farmerId: string; projectsEnrolled: number }> {
  await ensureMembershipGroup(input.membershipGroup);
  const farmerId = await createFarmer(input, registeredBy);
  await linkFarmerToUser(farmerId, input.phone, input.name);
  const projectsEnrolled = await enrollFarmerInProjects(farmerId, [input.project1, input.project2, input.project3]);

  await logAudit({
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

async function resolveRegisteredByAgentId(registeredBy?: string): Promise<string | null> {
  if (!registeredBy) return null;
  const asAgent = await queryOne<{ agent_id: string }>(
    'SELECT agent_id FROM agents WHERE agent_id = $1',
    [registeredBy]
  );
  if (asAgent) return asAgent.agent_id;
  const fromUser = await queryOne<{ agent_id: string }>(
    'SELECT agent_id FROM agents WHERE user_id = $1',
    [registeredBy]
  );
  return fromUser?.agent_id ?? null;
}

export async function createFarmer(
  input: FarmerInput & { key: string; phone: string; bankAccount?: string; kbFarmerId?: string; locationPath?: string },
  registeredBy?: string
): Promise<string> {
  const farmerId = uuidv4();
  const groupId = await getMembershipGroupIdByName(input.membershipGroup);
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
    (await assignAggregationCentre(country, input.district, input.subCounty, input.aggregationCenter)) ?? null;

  const normalizedId = input.idNumber.trim();
  const idNumberEncrypted = encryptField(normalizedId);
  const idNumberHash = hashIdNumber(normalizedId);
  const existingHash = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE id_number_hash = $1',
    [idNumberHash]
  );
  if (existingHash) {
    throw new Error('ID number already exists in system');
  }

  const bankAccountEncrypted = input.bankAccount ? encryptField(input.bankAccount) : null;
  const membershipType = input.membershipType ?? 'Active';
  const registeredByAgentId = await resolveRegisteredByAgentId(registeredBy);
  const farmerStatus = mapFarmerStatus(membershipType, !!registeredByAgentId);

  await query(
    `INSERT INTO farmers (
      farmer_id, key, name, gender, id_number_encrypted, id_number_hash, bank_account_encrypted,
      membership_group_id, aggregation_center, phone_number, phone_country_prefix,
      country, district, sub_county, parish, village,
      membership_type, occupation, size_of_land,
      picture_url, status, registered_by_agent_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    )`,
    [
      farmerId,
      input.key,
      input.name,
      input.gender,
      idNumberEncrypted,
      idNumberHash,
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
      membershipType,
      input.occupation ?? null,
      input.sizeOfLand ?? null,
      input.picture ?? null,
      farmerStatus,
      registeredByAgentId,
    ]
  );

  await logAudit({
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

export async function getFarmerByPhone(phone: string) {
  return queryOne(
    `SELECT f.*, mg.name as membership_group_name
     FROM farmers f
     JOIN membership_groups mg ON f.membership_group_id = mg.id
     WHERE f.phone_number = $1`,
    [phone]
  );
}

export async function getFarmerById(farmerId: string) {
  const farmer = await queryOne<Record<string, unknown>>(
    `SELECT f.*, mg.name as membership_group_name,
            u.name AS registered_agent_name, u.phone_number AS registered_agent_phone,
            u.user_id AS registered_agent_user_id,
            a.agent_id AS registered_agent_id,
            ac.manager_phone AS aggregation_centre_contact,
            ac.location_level_1 AS centre_location_level_1,
            ac.location_level_2 AS centre_location_level_2
     FROM farmers f
     JOIN membership_groups mg ON f.membership_group_id = mg.id
     LEFT JOIN agents a ON a.agent_id = f.registered_by_agent_id
     LEFT JOIN users u ON u.user_id = a.user_id
     LEFT JOIN aggregation_centres ac ON lower(ac.name) = lower(f.aggregation_center)
     WHERE f.farmer_id = $1`,
    [farmerId]
  );

  if (!farmer) return null;

  const projects = await getFarmerProjectSummaries(farmerId);
  const picture_url = await resolvePhotoUrlForDisplay(
    typeof farmer.picture_url === 'string' ? farmer.picture_url : null
  );

  return { ...farmer, picture_url, projects };
}

/** Audit + PM review queue entry after agent registers a farmer. */
export async function recordFarmerRegistrationFollowUp(
  farmerId: string,
  farmerName: string,
  registeredByUserId?: string,
  membershipGroup?: string,
  status?: string
): Promise<void> {
  await logAudit({
    userId: registeredByUserId,
    action: 'farmer.registration_review',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: {
      farmer_name: farmerName,
      membership_group: membershipGroup,
      farmer_status: status ?? 'pending_review',
      message: `New farmer registration: ${farmerName}. Awaiting PM review.`,
      assigned_to_role: 'project_manager',
      task_type: 'farmer_registration_review',
    },
    success: true,
  });
}

export async function advanceFarmerForFieldVerification(
  farmerId: string,
  reviewedByUserId: string
): Promise<{ status: string }> {
  const farmer = await queryOne<{ status: string; name: string }>(
    'SELECT status, name FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');
  if (farmer.status !== 'pending_review') {
    throw new Error(`Farmer is not pending review (current: ${farmer.status})`);
  }
  await query(
    `UPDATE farmers SET status = 'pending_field_verification', updated_at = NOW() WHERE farmer_id = $1`,
    [farmerId]
  );
  await logAudit({
    userId: reviewedByUserId,
    action: 'farmer.pm_approved_for_field',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { farmer_name: farmer.name, farmer_status: 'pending_field_verification' },
    success: true,
  });
  return { status: 'pending_field_verification' };
}

export async function verifyFarmerByFieldAgent(
  farmerId: string,
  agentUserId: string,
  verificationStatus: 'verified' | 'rejected',
  notes?: string
): Promise<{ status: string }> {
  const farmer = await queryOne<{ status: string; name: string }>(
    'SELECT status, name FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');

  const current = farmer.status;
  if (current === 'verified' || current === 'rejected') {
    return { status: current };
  }
  if (current !== 'pending_field_verification') {
    throw new Error(
      `Farmer must be Pending Field Verification before verify (current: ${current.replace(/_/g, ' ')})`
    );
  }

  const newStatus = verificationStatus === 'verified' ? 'verified' : 'rejected';
  await query(
    `UPDATE farmers SET status = $1, updated_at = NOW() WHERE farmer_id = $2`,
    [newStatus, farmerId]
  );

  await logAudit({
    userId: agentUserId,
    action: verificationStatus === 'verified' ? 'farmer.field_verified' : 'farmer.field_rejected',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: {
      farmer_name: farmer.name,
      verification_notes: notes,
      previous_status: current,
      verification_status: verificationStatus,
    },
    success: true,
  });

  return { status: newStatus };
}

function farmerSearchClause(search?: string, startParam = 1): { sql: string; params: string[] } {
  const term = search?.trim();
  if (!term) return { sql: '', params: [] };

  const pattern = `%${term}%`;
  const phoneDigits = term.replace(/\D/g, '');
  const clauses: string[] = [];
  const params: string[] = [];
  let idx = startParam;

  const addClause = (sql: string, value: string) => {
    clauses.push(sql.replace('?', `$${idx}`));
    params.push(value);
    idx++;
  };

  addClause('f.name ILIKE ?', pattern);
  addClause('f.district ILIKE ?', pattern);
  addClause('mg.name ILIKE ?', pattern);

  if (phoneDigits.length >= 3) {
    addClause('f.phone_number LIKE ?', `%${phoneDigits}%`);
  }

  for (const part of term.split(/\s+/).filter((p) => p.length >= 2)) {
    if (part.toLowerCase() === term.toLowerCase()) continue;
    addClause('f.name ILIKE ?', `%${part}%`);
  }

  return {
    sql: ` AND (${clauses.join(' OR ')})`,
    params,
  };
}

/** When searching, ignore country filter so names are found across all countries */
function resolveCountryFilter(country?: string, search?: string): string | undefined {
  if (search?.trim()) return undefined;
  return country;
}

export async function getAllFarmers(limit = 100, offset = 0, country?: string, search?: string) {
  const effectiveCountry = resolveCountryFilter(country, search);
  const { sql: searchSql, params: searchParams } = farmerSearchClause(search, effectiveCountry ? 2 : 1);

  if (effectiveCountry) {
    const limitIdx = searchParams.length + 2;
    const offsetIdx = searchParams.length + 3;
    return query(
      `SELECT f.*, mg.name as membership_group_name
       FROM farmers f
       JOIN membership_groups mg ON f.membership_group_id = mg.id
       WHERE f.country = $1${searchSql}
       ORDER BY LOWER(f.name)
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [effectiveCountry, ...searchParams, limit, offset]
    );
  }

  const whereSearch = searchSql ? `WHERE 1=1${searchSql}` : '';
  const limitIdx = searchParams.length + 1;
  const offsetIdx = searchParams.length + 2;
  return query(
    `SELECT f.*, mg.name as membership_group_name
     FROM farmers f
     JOIN membership_groups mg ON f.membership_group_id = mg.id
     ${whereSearch}
     ORDER BY LOWER(f.name)
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...searchParams, limit, offset]
  );
}

export async function getFarmerCount(country?: string, search?: string): Promise<number> {
  const effectiveCountry = resolveCountryFilter(country, search);
  const { sql: searchSql, params: searchParams } = farmerSearchClause(search, effectiveCountry ? 2 : 1);

  if (effectiveCountry) {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM farmers f
       JOIN membership_groups mg ON f.membership_group_id = mg.id
       WHERE f.country = $1${searchSql}`,
      [effectiveCountry, ...searchParams]
    );
    return row?.count ?? 0;
  }

  if (searchSql) {
    const row = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM farmers f
       JOIN membership_groups mg ON f.membership_group_id = mg.id
       WHERE 1=1${searchSql}`,
      searchParams
    );
    return row?.count ?? 0;
  }

  const row = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM farmers');
  return row?.count ?? 0;
}

export async function getFarmerCountByCountry(): Promise<Record<string, number>> {
  const rows = await query<{ country: string; count: number }>(
    'SELECT country, COUNT(*)::int AS count FROM farmers GROUP BY country ORDER BY count DESC'
  );
  return Object.fromEntries(rows.map((r) => [r.country, r.count]));
}

export function isLocationPending(farmer: { district?: string; sub_county?: string }): boolean {
  return (
    farmer.district === PENDING_LOCATION_LABEL ||
    farmer.sub_county === PENDING_LOCATION_LABEL
  );
}

export async function updateFarmerLocation(
  farmerId: string,
  input: { district: string; subCounty: string; parish?: string; village?: string }
): Promise<void> {
  const farmer = await queryOne<{
    country: string;
    phone_number: string;
    parish: string | null;
    village: string | null;
  }>('SELECT * FROM farmers WHERE farmer_id = $1', [farmerId]);

  if (!farmer) throw new Error('Farmer not found');

  const country = farmer.country ?? 'Kenya';
  const countryConfig = getCountryConfig(country);
  if (!countryConfig) throw new Error(`Unsupported country: ${country}`);

  const locCheck = validateRegionalLocation(country, input.district, input.subCounty, input.parish, true);
  if (!locCheck.valid) {
    throw new Error(locCheck.error ?? 'Invalid location');
  }

  const code = getCountryCode(country)!;
  const l1 = getLevel1Options(code).find((d) => d.toLowerCase() === input.district.toLowerCase())!;
  const l2 = locCheck.subCounty ?? input.subCounty;
  const parish = input.parish?.trim()
    ? getLevel3Options(code, l1, l2).find((p) => p.toLowerCase() === input.parish!.toLowerCase()) ?? input.parish.trim()
    : null;
  const village = input.village?.trim() || null;
  const aggregationCenter = (await assignAggregationCentre(country, l1, l2)) ?? null;

  await query(
    `UPDATE farmers SET
      district = $1, sub_county = $2, parish = $3, village = $4,
      aggregation_center = COALESCE($5, aggregation_center),
      updated_at = NOW()
     WHERE farmer_id = $6`,
    [l1, l2, parish, village, aggregationCenter, farmerId]
  );

  await logAudit({
    action: 'farmer.update_location',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { district: l1, subCounty: l2, parish, village },
    success: true,
  });
}

export async function updateFarmerPicture(
  farmerId: string,
  pictureUrl: string
): Promise<{ status: string }> {
  const photoError = validateFarmerPhotoRequired(pictureUrl);
  if (photoError) throw new Error(photoError);

  const key = pictureUrl.trim();
  if (!isOwnFarmerProfilePhotoKey(key, farmerId)) {
    throw new Error('Invalid profile photo key for this farmer');
  }

  const farmer = await queryOne<{ farmer_id: string; status: string }>(
    'SELECT farmer_id, status FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');

  const previousStatus = farmer.status;
  // New/changed verification photos need a field agent in-person check.
  // Keep pending_review so PM queue order is preserved until they advance the farmer.
  const nextStatus =
    previousStatus === 'pending_review' ? previousStatus : 'pending_field_verification';

  await query(
    `UPDATE farmers SET picture_url = $1, status = $2, updated_at = NOW() WHERE farmer_id = $3`,
    [key, nextStatus, farmerId]
  );

  await logAudit({
    action: 'farmer.update',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: {
      field: 'picture_url',
      objectKey: key,
      previous_status: previousStatus,
      farmer_status: nextStatus,
      requires_field_verification: nextStatus === 'pending_field_verification',
    },
    success: true,
  });

  return { status: nextStatus };
}

export { PENDING_LOCATION_LABEL };

export async function generateFarmerKey(): Promise<string> {
  const count = await getFarmerCount();
  return `KB-${String(count + 1).padStart(5, '0')}`;
}
