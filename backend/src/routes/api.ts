import { Router, Request, Response } from 'express';
import express from 'express';
import multer from 'multer';
import { validateFarmerRow } from '../../../shared/src/validation';
import {
  createFarmer,
  generateFarmerKey,
  getAllFarmers,
  getFarmerCount,
  getMembershipGroupNames,
  getExistingIdentifiers,
} from '../services/farmerService';
import {
  validateCsvImport,
  executeImport,
  getImportProgress,
  getImportComplete,
} from '../services/importService';
import { MAX_CSV_SIZE_BYTES } from '../../../shared/src/constants';
import { DISTRICTS, SUB_COUNTIES, PROJECTS, MEMBERSHIP_TYPES } from '../../../shared/src/constants';
import { COUNTRY_LIST, LOCATION_DATA } from '../../../shared/src/regional';
import { AGGREGATION_CENTRES } from '../../../shared/src/locations/aggregationCentres';
import { authenticate, requirePermission, requireRole } from '../middleware/auth';
import { replaceDatabaseFile } from '../db/database';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_SIZE_BYTES },
});
const dbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get('/reference', (_req: Request, res: Response) => {
  res.json({
    districts: DISTRICTS,
    subCounties: SUB_COUNTIES,
    membershipGroups: getMembershipGroupNames(),
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
});

router.get('/farmers', authenticate, requirePermission('farmers.read'), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const farmers = getAllFarmers(limit, offset);
  res.json({ farmers, total: getFarmerCount() });
});

router.post('/farmers/register', authenticate, requirePermission('farmers.write'), (req: Request, res: Response) => {
  const input = req.body;
  const existing = getExistingIdentifiers();
  const membershipGroups = getMembershipGroupNames();

  const farmerInput = {
    key: input.key || generateFarmerKey(),
    name: input.name,
    gender: input.gender,
    idNumber: input.idNumber,
    membershipGroup: input.membershipGroup,
    aggregationCenter: input.aggregationCenter,
    phone: input.phone,
    country: input.country || 'Kenya',
    district: input.district,
    subCounty: input.subCounty,
    parish: input.parish,
    village: input.village,
    membershipType: input.membershipType,
    occupation: input.occupation,
    sizeOfLand: input.sizeOfLand,
    project1: input.project1,
    project2: input.project2,
    project3: input.project3,
    picture: input.pictureUri,
  };

  const result = validateFarmerRow(farmerInput, {
    existingPhones: existing.phones,
    existingIdNumbers: existing.idNumbers,
    existingKeys: existing.keys,
    membershipGroups,
  });

  if (!result.valid) {
    res.status(400).json({ success: false, errors: result.errors });
    return;
  }

  try {
    const farmerId = createFarmer({
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
});

router.post('/admin/farmers/import/validate', authenticate, requirePermission('farmers.import'), upload.single('file'), (req: Request, res: Response) => {
  let content: string | undefined;
  let columnMapping: Record<string, string> | undefined;

  if (req.file) {
    content = req.file.buffer.toString('utf-8');
  } else if (typeof req.body === 'string' && req.body.length > 0) {
    content = req.body;
  } else if (req.body?.content) {
    content = req.body.content;
  }

  if (!content) {
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
    const result = validateCsvImport(content, columnMapping);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Validation failed',
    });
  }
});

router.post('/admin/farmers/import/validate-text', authenticate, requirePermission('farmers.import'), express.text({ type: '*/*', limit: '50mb' }), (req: Request, res: Response) => {
  const content = req.body as string;
  if (!content) {
    res.status(400).json({ error: 'No CSV content provided' });
    return;
  }
  try {
    const result = validateCsvImport(content);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Validation failed',
    });
  }
});

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

router.get('/admin/farmers/import/:sessionId/progress', authenticate, requirePermission('farmers.import'), (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const importId = req.query.importId as string;
  const progress = getImportProgress(importId, sessionId);
  if (!progress) {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  res.json(progress);
});

router.get('/admin/farmers/import/:sessionId/complete', authenticate, requirePermission('farmers.import'), (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const result = getImportComplete(sessionId);
  if (!result) {
    res.status(404).json({ error: 'Import not complete or not found' });
    return;
  }
  res.json(result);
});

/** Upload local kilimo.db to hosted preview (pilot only). Hot-reloads DB without server restart. */
router.post('/setup/database/restore', dbUpload.single('database'), (req: Request, res: Response) => {
  const secret = req.headers['x-restore-secret'] as string | undefined;
  if (!process.env.RESTORE_DB_SECRET || secret !== process.env.RESTORE_DB_SECRET) {
    res.status(401).json({ error: 'Invalid restore secret' });
    return;
  }
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: 'Upload kilimo.db as form field "database"' });
    return;
  }

  try {
    const farmerCount = replaceDatabaseFile(req.file.buffer);
    res.json({
      success: true,
      message: 'Database restored and live immediately.',
      totalFarmers: farmerCount,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Restore failed',
    });
  }
});

export default router;
