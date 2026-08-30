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
import {
  enrollFarmerInProgramProjects,
  enrollFarmerInProjectById,
  getFarmerProjectSummaries,
} from './farmerProgramService';
import { isOwnFarmerProfilePhotoKey, resolvePhotoUrlForDisplay } from './r2StorageService';
import { validateFarmerPhotoRequired } from '../../../shared/src/farmerPhoto';
import { resolveFarmerAppUserId } from './farmerAppUser';
import { upsertVillageFromRegistration } from './customLocationService';
import {
  buildFarmerListWhere,
  farmerListScopeForViewer,
  parseFarmerListFilters,
  type FarmerListFilters,
  type FarmerListScope,
} from './farmerListQuery';

/** Postgres farmer_status enum — agent field registrations await PM review. */
function mapFarmerStatus(_membershipType?: string, registeredByAgent?: boolean): string {
  if (registeredByAgent) return 'pending_review';
  return 'verified';
}

export async function getMembershipGroups(): Promise<Array<{ id: string; name: string }>> {
  return query<{ id: string; name: string }>(
    'SELECT id, name FROM membership_groups ORDER BY name'
  );
}

export async function getMembershipGroupNames(): Promise<string[]> {
  const rows = await getMembershipGroups();
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
 * Login is created inside createFarmer (same as app registration).
 */
export async function importFarmerFromCsv(
  input: FarmerInput & { key: string; phone: string; kbFarmerId?: string; locationPath?: string },
  registeredBy?: string
): Promise<{ farmerId: string; projectsEnrolled: number }> {
  await ensureMembershipGroup(input.membershipGroup);
  const farmerId = await createFarmer(input, registeredBy);
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
  const registrationCategory = input.registrationCategory ?? 'individual';
  const membershipStatus = 'pending_verification';
  const ward = (input.ward ?? input.parish)?.trim() || null;
  const parish = input.parish ?? ward;
  const familySizeRaw = input.familySize;
  const familySize =
    familySizeRaw !== undefined && familySizeRaw !== null && String(familySizeRaw).trim() !== ''
      ? parseInt(String(familySizeRaw), 10)
      : null;
  const dependantsRaw = input.numberOfDependants;
  const numberOfDependants =
    dependantsRaw !== undefined && dependantsRaw !== null && String(dependantsRaw).trim() !== ''
      ? parseInt(String(dependantsRaw), 10)
      : null;
  const specialNeeds =
    input.specialNeeds === true ||
    input.specialNeeds === 'yes' ||
    input.specialNeeds === 'Yes' ||
    input.specialNeeds === 'true';
  const isRefugee =
    input.isRefugee === true ||
    input.membershipCategory?.trim() === 'Refugee' ||
    input.membershipCategory?.startsWith('Refugee');

  await query(
    `INSERT INTO farmers (
      farmer_id, key, name, gender, id_number_encrypted, id_number_hash, bank_account_encrypted,
      membership_group_id, aggregation_center, phone_number, phone_country_prefix,
      country, district, sub_county, parish, village, ward,
      membership_type, registration_category, membership_category, membership_status,
      occupation, profession, size_of_land, land_unit, farm_input_required,
      family_size, number_of_dependants, special_needs, project_location_gps, currency,
      project_enrolment_sector, project_enrolment_programme, project_enrolment_project,
      organization_name, organization_registration_number, tax_pin,
      contact_person_name, contact_person_role, contact_person_email,
      refugee_status_document_url, humanitarian_assistance_type, preferred_language,
      emergency_contact_name, emergency_contact_phone, special_vulnerabilities, is_refugee,
      picture_url, status, registered_by_agent_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
      $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46,
      $47, $48, $49, $50
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
      parish ?? null,
      input.village ?? null,
      ward,
      membershipType,
      registrationCategory,
      input.membershipCategory ?? null,
      membershipStatus,
      input.occupation ?? null,
      input.profession ?? null,
      input.sizeOfLand ?? null,
      input.landUnit ?? 'Ha',
      input.farmInputRequired ?? null,
      familySize,
      numberOfDependants,
      specialNeeds,
      input.projectLocationGps ?? null,
      input.currency ?? null,
      input.projectEnrolmentSectorId ?? null,
      input.projectEnrolmentProgramId ?? null,
      input.projectEnrolmentProjectId ?? null,
      input.organizationName ?? null,
      input.organizationRegistrationNumber ?? null,
      input.taxPin?.trim() || null,
      input.contactPersonName ?? null,
      input.contactPersonRole ?? null,
      input.contactPersonEmail ?? null,
      input.refugeeStatusDocumentUrl ?? null,
      input.humanitarianAssistanceType ?? null,
      input.preferredLanguage ?? null,
      input.emergencyContactName ?? null,
      input.emergencyContactPhone ?? null,
      input.specialVulnerabilities ?? null,
      isRefugee,
      input.picture ?? null,
      farmerStatus,
      registeredByAgentId,
    ]
  );

  // New farmers can log in immediately via OTP (users.status defaults to active), matching CSV import.
  try {
    await linkFarmerToUser(farmerId, input.phone, input.name, {
      district: input.district,
      aggregationCenter,
    });
  } catch (err) {
    await query('DELETE FROM farmers WHERE farmer_id = $1', [farmerId]).catch(() => undefined);
    throw err instanceof Error ? err : new Error('Could not create farmer login');
  }

  if (
    registrationCategory === 'individual' &&
    !input.skipProjectEnrolment &&
    input.projectEnrolmentProjectId?.trim()
  ) {
    await enrollFarmerInProjectById(farmerId, input.projectEnrolmentProjectId.trim());
  }

  await logAudit({
    userId: registeredBy,
    action: 'farmer.create',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { district: input.district, key: input.key, kbFarmerId, country, aggregationCenter },
    success: true,
  });

  try {
    await upsertVillageFromRegistration({
      country,
      level1: input.district,
      level2: input.subCounty,
      level3: parish,
      village: input.village,
      createdByUserId: registeredBy ?? null,
    });
  } catch (err) {
    console.error('[custom_locations] upsert after register failed:', err);
  }

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
  const pending_picture_url = await resolvePhotoUrlForDisplay(
    typeof farmer.pending_picture_url === 'string' ? farmer.pending_picture_url : null
  );

  return { ...farmer, picture_url, pending_picture_url, projects };
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

const FARMER_LIST_FROM = `FROM farmers f
       JOIN membership_groups mg ON f.membership_group_id = mg.id`;

const AGENT_FARMER_COLUMNS = `f.farmer_id, f.key, f.name, f.phone_number, f.district, f.sub_county, f.status,
              f.pending_picture_url, mg.name as membership_group_name`;

export async function listFarmers(opts: {
  scope: FarmerListScope;
  filters?: FarmerListFilters;
  limit?: number;
  offset?: number;
  columns?: 'full' | 'agent';
}): Promise<Record<string, unknown>[]> {
  const { sql: whereSql, params } = buildFarmerListWhere(opts.scope, opts.filters ?? {});
  const select =
    opts.columns === 'agent' ? AGENT_FARMER_COLUMNS : 'f.*, mg.name as membership_group_name';
  const limit = opts.limit != null && opts.limit > 0 ? Math.min(opts.limit, 500) : undefined;
  const offset = opts.offset != null && opts.offset > 0 ? opts.offset : 0;
  const paging: unknown[] = [];
  let pagingSql = '';
  if (limit != null) {
    pagingSql = ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    paging.push(limit, offset);
  }
  return query(
    `SELECT ${select}
     ${FARMER_LIST_FROM}
     ${whereSql}
     ORDER BY LOWER(f.name)
     ${pagingSql}`,
    [...params, ...paging]
  );
}

export async function countFarmers(opts: {
  scope: FarmerListScope;
  filters?: FarmerListFilters;
}): Promise<number> {
  const { sql: whereSql, params } = buildFarmerListWhere(opts.scope, opts.filters ?? {});
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     ${FARMER_LIST_FROM}
     ${whereSql}`,
    params
  );
  return row?.count ?? 0;
}

export { farmerListScopeForViewer, parseFarmerListFilters };

/** Unscoped paginated list — prefer listFarmers with a viewer scope for product routes. */
export async function getAllFarmers(limit = 100, offset = 0, country?: string, search?: string) {
  return listFarmers({
    scope: { kind: 'unrestricted' },
    filters: { country, q: search },
    limit,
    offset,
  });
}

export async function getFarmerCount(country?: string, search?: string): Promise<number> {
  return countFarmers({
    scope: { kind: 'unrestricted' },
    filters: { country, q: search },
  });
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
  input: { district: string; subCounty: string; parish?: string; village?: string },
  createdByUserId?: string
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

  try {
    await upsertVillageFromRegistration({
      country,
      level1: l1,
      level2: l2,
      level3: parish,
      village,
      createdByUserId: createdByUserId ?? null,
    });
  } catch (err) {
    console.error('[custom_locations] upsert after location update failed:', err);
  }
}

export async function ensurePendingPictureColumn(): Promise<void> {
  await query(`ALTER TABLE farmers ADD COLUMN IF NOT EXISTS pending_picture_url TEXT`);
}

async function notifyFarmerPhotoDecision(
  farmerId: string,
  decision: 'approved' | 'rejected'
): Promise<void> {
  const farmerUserId = await resolveFarmerAppUserId(farmerId);
  if (!farmerUserId) {
    throw new Error('Farmer app account not found — they would not receive a notification');
  }
  const { createNotification } = await import('./notificationService');
  await createNotification({
    userId: farmerUserId,
    title:
      decision === 'approved' ? 'Profile image has been approved' : 'Profile image is rejected',
    message:
      decision === 'approved'
        ? 'Your field agent approved your new profile image. It is now on your profile.'
        : 'Your field agent rejected your new profile image. Your current photo is unchanged. You can submit another one.',
    type: decision === 'approved' ? 'farmer_photo_approved' : 'farmer_photo_rejected',
    contextType: 'farmer',
    contextId: farmerId,
    actionUrl: '/profile',
  });
}

/** Farmer submits a new photo; it stays pending until the field agent approves. */
export async function submitFarmerPictureForApproval(
  farmerId: string,
  pictureUrl: string
): Promise<void> {
  await ensurePendingPictureColumn();
  const photoError = validateFarmerPhotoRequired(pictureUrl);
  if (photoError) throw new Error(photoError);

  const key = pictureUrl.trim();
  if (!isOwnFarmerProfilePhotoKey(key, farmerId)) {
    throw new Error('Invalid profile photo key for this farmer');
  }

  const farmer = await queryOne<{ farmer_id: string; name: string }>(
    'SELECT farmer_id, name FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');

  await query(
    `UPDATE farmers SET pending_picture_url = $1, updated_at = NOW() WHERE farmer_id = $2`,
    [key, farmerId]
  );

  const { getFarmerSupportContacts } = await import('./farmerHelpRequestService');
  const contacts = await getFarmerSupportContacts(farmerId);
  const agentUserId = contacts.fieldAgent?.userId?.trim();
  if (agentUserId) {
    const { createNotification } = await import('./notificationService');
    await createNotification({
      userId: agentUserId,
      title: 'Profile photo update',
      message: `${farmer.name} submitted a new profile photo. Open their profile to review and approve it.`,
      type: 'farmer_photo_update',
      contextType: 'farmer',
      contextId: farmerId,
      actionUrl: `/farmers/${farmerId}`,
      priority: 'high',
    });
  }

  await logAudit({
    action: 'farmer.photo_submitted',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { field: 'pending_picture_url', objectKey: key, notifiedAgent: Boolean(agentUserId) },
    success: true,
  });
}

export async function reviewFarmerPicture(
  farmerId: string,
  agentUserId: string,
  decision: 'approved' | 'rejected'
): Promise<{ status: 'approved' | 'rejected' }> {
  await ensurePendingPictureColumn();
  const farmer = await queryOne<{ name: string; pending_picture_url: string | null }>(
    'SELECT name, pending_picture_url FROM farmers WHERE farmer_id = $1',
    [farmerId]
  );
  if (!farmer) throw new Error('Farmer not found');
  if (!farmer.pending_picture_url?.trim()) {
    throw new Error('No photo update is waiting for approval');
  }
  if (!(await resolveFarmerAppUserId(farmerId))) {
    throw new Error('Farmer app account not found — they would not receive a notification');
  }

  if (decision === 'approved') {
    await query(
      `UPDATE farmers
       SET picture_url = pending_picture_url, pending_picture_url = NULL, updated_at = NOW()
       WHERE farmer_id = $1`,
      [farmerId]
    );
  } else {
    await query(
      `UPDATE farmers SET pending_picture_url = NULL, updated_at = NOW() WHERE farmer_id = $1`,
      [farmerId]
    );
  }

  await notifyFarmerPhotoDecision(farmerId, decision);

  await logAudit({
    userId: agentUserId,
    action: decision === 'approved' ? 'farmer.photo_approved' : 'farmer.photo_rejected',
    category: 'farmer_data',
    resourceType: 'farmer',
    resourceId: farmerId,
    details: { farmer_name: farmer.name, decision },
    success: true,
  });

  return { status: decision };
}

export { PENDING_LOCATION_LABEL };

export async function generateFarmerKey(): Promise<string> {
  const count = await getFarmerCount();
  return `KB-${String(count + 1).padStart(5, '0')}`;
}
