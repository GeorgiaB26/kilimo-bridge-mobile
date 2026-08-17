import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import multer from 'multer';
import { validateFarmerRow } from '../../../shared/src/validation';
import { hashIdNumber } from '../services/encryptionService';
import {
  createFarmer,
  generateFarmerKey,
  getAllFarmers,
  getFarmerCount,
  getMembershipGroupNames,
  getExistingIdentifiers,
  recordFarmerRegistrationFollowUp,
  advanceFarmerForFieldVerification,
  verifyFarmerByFieldAgent,
} from '../services/farmerService';
import { validateCsvImport, executeImport, getImportProgress, getImportComplete, getImportValidationErrors, formatImportErrorsCsv } from '../services/importService';
import { BINARY_IMPORT_PREFIX } from '../services/spreadsheetParser';
import { MAX_CSV_SIZE_BYTES } from '../../../shared/src/constants';
import { DISTRICTS, SUB_COUNTIES, PROJECTS, MEMBERSHIP_TYPES } from '../../../shared/src/constants';
import { COUNTRY_LIST, LOCATION_DATA } from '../../../shared/src/regional';
import { AGGREGATION_CENTRES } from '../../../shared/src/locations/aggregationCentres';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import { queryOne } from '../db/database';
import {
  listSectors,
  listPrograms,
  listProgramProjects,
} from '../services/hierarchyService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE_BYTES },
});
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

router.get('/reference', asyncHandler(async (_req, res) => {
  res.json({
    districts: DISTRICTS,
    subCounties: SUB_COUNTIES,
    membershipGroups: await getMembershipGroupNames(),
    projects: PROJECTS,
    membershipTypes: MEMBERSHIP_TYPES,
    countries: COUNTRY_LIST.map((c) => ({
      code: c.code,
      name: c.name,
      levelLabels: c.levelLabels,
      phoneExample: c.phoneExample,
    })),
    locationData: LOCATION_DATA,
    aggregationCentres: AGGREGATION_CENTRES.map((c) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      locationLevel1: c.locationLevel1,
    })),
  });
}));

router.get(
  '/reference/project-hierarchy',
  authenticate,
  requirePermission('farmers.read'),
  asyncHandler(async (_req, res) => {
    const sectors = await listSectors();
    const programs = await listPrograms();
    const projects = await listProgramProjects();
    res.json({
      sectors: sectors.map((s: { id: string; name: string; description?: string | null }) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
      })),
      programs: programs.map(
        (p: { id: string; name: string; sector_id: string; description?: string | null }) => ({
          id: p.id,
          name: p.name,
          sector_id: p.sector_id,
          description: p.description ?? null,
        })
      ),
      projects: projects.map(
        (pp: {
          id: string;
          name: string;
          program_id: string;
          description?: string | null;
        }) => ({
          id: pp.id,
          name: pp.name,
          program_id: pp.program_id,
          description: pp.description ?? null,
        })
      ),
    });
  })
);

router.get('/farmers', authenticate, requirePermission('farmers.read'), asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const farmers = await getAllFarmers(limit, offset);
  res.json({ farmers, total: await getFarmerCount() });
}));

router.patch(
  '/farmers/:farmerId/verify',
  authenticate,
  requirePermission('farmers.write'),
  asyncHandler(async (req, res) => {
    const { verification_status, verification_notes } = req.body;
    const status = verification_status === 'rejected' ? 'rejected' : 'verified';
    try {
      const result = await verifyFarmerByFieldAgent(
        req.params.farmerId,
        req.user!.userId,
        status,
        verification_notes
      );
      res.json({ success: true, status: result.status });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Verification failed' });
    }
  })
);

router.post('/farmers/register', authenticate, requirePermission('farmers.write'), asyncHandler(async (req, res) => {
  const input = req.body;
  const existing = await getExistingIdentifiers();
  const membershipGroups = await getMembershipGroupNames();

  const farmerInput = {
    key: input.key || (await generateFarmerKey()),
    name: input.name,
    gender: input.gender,
    idNumber: input.idNumber,
    membershipGroup: input.membershipGroup,
    aggregationCenter: input.aggregationCenter,
    aggregationCentreId: input.aggregationCentreId,
    phone: input.phone,
    country: input.country || 'Kenya',
    currency: input.currency,
    district: input.district,
    subCounty: input.subCounty,
    parish: input.parish,
    village: input.village,
    ward: input.ward,
    registrationCategory: input.registrationCategory,
    membershipCategory: input.membershipCategory,
    membershipType: input.membershipType,
    occupation: input.occupation,
    profession: input.profession,
    sizeOfLand: input.sizeOfLand,
    landUnit: input.landUnit,
    farmInputRequired: input.farmInputRequired,
    familySize: input.familySize,
    numberOfDependants: input.numberOfDependants,
    specialNeeds: input.specialNeeds,
    projectLocationGps: input.projectLocationGps,
    organizationName: input.organizationName,
    organizationRegistrationNumber: input.organizationRegistrationNumber,
    taxPin: input.taxPin,
    contactPersonName: input.contactPersonName,
    contactPersonRole: input.contactPersonRole,
    contactPersonEmail: input.contactPersonEmail,
    projectEnrolmentSectorId: input.projectEnrolmentSectorId,
    projectEnrolmentProgramId: input.projectEnrolmentProgramId,
    projectEnrolmentProjectId: input.projectEnrolmentProjectId,
    skipProjectEnrolment: input.skipProjectEnrolment,
    project1: input.project1,
    project2: input.project2,
    project3: input.project3,
    picture: input.pictureUri ?? input.picture,
  };

  if (!farmerInput.membershipCategory?.trim()) {
    res.status(400).json({
      success: false,
      errors: [{ field: 'membershipCategory', value: '', error: 'Membership category is required' }],
    });
    return;
  }

  const isCorporate = farmerInput.registrationCategory === 'corporate';
  if (isCorporate) {
    const corpErrors: Array<{ field: string; value: string; error: string }> = [];
    if (!farmerInput.organizationName?.trim()) {
      corpErrors.push({ field: 'organizationName', value: '', error: 'Organization name is required' });
    }
    if (!farmerInput.organizationRegistrationNumber?.trim()) {
      corpErrors.push({
        field: 'organizationRegistrationNumber',
        value: '',
        error: 'Registration number is required',
      });
    }
    if (!farmerInput.taxPin?.trim()) {
      corpErrors.push({ field: 'taxPin', value: '', error: 'Tax PIN is required' });
    }
    if (!farmerInput.contactPersonName?.trim()) {
      corpErrors.push({ field: 'contactPersonName', value: '', error: 'Contact person name is required' });
    }
    if (!farmerInput.contactPersonRole?.trim()) {
      corpErrors.push({ field: 'contactPersonRole', value: '', error: 'Contact person role is required' });
    }
    if (corpErrors.length > 0) {
      res.status(400).json({ success: false, errors: corpErrors });
      return;
    }
  }

  const result = validateFarmerRow(farmerInput, {
    existingPhones: existing.phones,
    existingIdNumberHashes: existing.idNumberHashes,
    hashIdNumber,
    existingKeys: existing.keys,
    membershipGroups,
  });

  if (!result.valid) {
    res.status(400).json({ success: false, errors: result.errors });
    return;
  }

  try {
    const farmerId = await createFarmer({
      ...farmerInput,
      ...result.normalized,
      key: result.normalized.key ?? farmerInput.key,
      phone: result.normalized.phone ?? farmerInput.phone,
      name: result.normalized.name ?? farmerInput.name,
      gender: result.normalized.gender ?? farmerInput.gender,
      idNumber: result.normalized.idNumber ?? farmerInput.idNumber,
      membershipGroup: result.normalized.membershipGroup ?? farmerInput.membershipGroup,
      district: result.normalized.district ?? farmerInput.district,
      subCounty: result.normalized.subCounty ?? farmerInput.subCounty,
      kbFarmerId: result.normalized.kbFarmerId,
      locationPath: result.normalized.locationPath,
    } as Parameters<typeof createFarmer>[0], req.user?.userId);

    await recordFarmerRegistrationFollowUp(
      farmerId,
      result.normalized.name ?? farmerInput.name,
      req.user?.userId,
      result.normalized.membershipGroup ?? farmerInput.membershipGroup,
      'pending_review'
    );

    if (process.env.PILOT_AUTO_FIELD_VERIFICATION === 'true') {
      await advanceFarmerForFieldVerification(farmerId, req.user?.userId ?? 'system');
    }

    res.status(201).json({
      success: true,
      farmerId,
      key: result.normalized.key ?? farmerInput.key,
      kbFarmerId: result.normalized.kbFarmerId,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Registration failed',
    });
  }
}));

router.post('/admin/farmers/import/validate', authenticate, requirePermission('farmers.import'), upload.single('file'), asyncHandler(async (req, res) => {
  let content: string | Buffer | undefined;
  let columnMapping: Record<string, string> | undefined;

  if (req.file) {
    content = req.file.buffer;
  } else if (typeof req.body === 'string' && req.body.length > 0) {
    content = req.body;
  } else if (req.body?.content) {
    content = req.body.content;
  }

  if (!content || (typeof content === 'string' && content.length === 0) || (Buffer.isBuffer(content) && content.length === 0)) {
    res.status(400).json({ error: 'No CSV content provided' });
    return;
  }

  if (req.body?.columnMapping) {
    try {
      columnMapping = typeof req.body.columnMapping === 'string'
        ? JSON.parse(req.body.columnMapping)
        : req.body.columnMapping;
    } catch {
      res.status(400).json({ error: 'Invalid columnMapping JSON' });
      return;
    }
  }

  try {
    const fileName = (req.file?.originalname || req.body?.fileName || req.headers['x-import-file-name']) as string | undefined;
    const result = await validateCsvImport(content, columnMapping, { fileName });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Validation failed',
    });
  }
}));

router.post('/admin/farmers/import/validate-text', authenticate, requirePermission('farmers.import'), express.text({ type: '*/*', limit: '50mb' }), asyncHandler(async (req, res) => {
  const content = req.body as string;
  if (!content) {
    res.status(400).json({ error: 'No CSV content provided' });
    return;
  }
  try {
    const fileName = req.headers['x-import-file-name'] as string | undefined;
    const result = await validateCsvImport(content, undefined, { fileName });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Validation failed',
    });
  }
}));

router.post('/admin/farmers/import/confirm', authenticate, requirePermission('farmers.import'), async (req: Request, res: Response) => {
  const { sessionId, skipDuplicates = true } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }

  try {
    const result = await executeImport(sessionId, skipDuplicates, req.user?.userId);
    res.json({
      status: 'import_started',
      ...result,
      sessionId,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Import failed',
    });
  }
});

router.get('/admin/farmers/import/:sessionId/errors', authenticate, requirePermission('farmers.import'), asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const errors = await getImportValidationErrors(sessionId);
  if (errors.length === 0) {
    const session = await queryOne('SELECT id FROM import_sessions WHERE id = $1', [sessionId]);
    if (!session) {
      res.status(404).json({ error: 'Import session not found' });
      return;
    }
  }
  if (req.query.format === 'csv') {
    const csv = formatImportErrorsCsv(errors);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${sessionId.slice(0, 8)}.csv"`);
    res.send(csv);
    return;
  }
  res.json({ sessionId, totalErrors: errors.length, errors });
}));

router.get('/admin/farmers/import/:sessionId/progress', authenticate, requirePermission('farmers.import'), asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const importId = req.query.importId as string;
  const progress = await getImportProgress(importId, sessionId);
  if (!progress) {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  res.json(progress);
}));

router.get('/admin/farmers/import/:sessionId/complete', authenticate, requirePermission('farmers.import'), asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const result = await getImportComplete(sessionId);
  if (!result) {
    res.status(404).json({ error: 'Import not complete or not found' });
    return;
  }
  res.json(result);
}));

export default router;
