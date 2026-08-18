import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { hasPermission, Permission } from '../../../shared/src/roles';
import { logAudit } from '../services/auditService';
import {
  ALLOWED_CONTENT_TYPES,
  AllowedContentType,
  UploadPurpose,
  createPresignedUpload,
  createPresignedReadUrl,
  uploadObjectDirect,
  isR2Configured,
  isR2ObjectKey,
  MAX_UPLOAD_BYTES,
  READ_URL_EXPIRES_SECONDS,
} from '../services/r2StorageService';

const router = Router();
router.use(authenticate);

const UPLOAD_PURPOSES: UploadPurpose[] = [
  'farmer_registration',
  'task_evidence',
  'farmer_profile',
  'refugee_document',
];

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function deny(req: Request, res: Response, permission: string): void {
  void logAudit({
    userId: req.user?.userId,
    userRole: req.user?.role,
    action: 'permission.denied',
    category: 'system',
    details: { permission, path: req.path },
    ipAddress: req.ip,
    success: false,
  });
  res.status(403).json({ error: 'Insufficient permissions' });
}

function permissionForPurpose(purpose: UploadPurpose): Permission {
  if (purpose === 'farmer_registration' || purpose === 'refugee_document') return 'farmers.write';
  if (purpose === 'farmer_profile') return 'farmers.read.own';
  return 'tasks.submit';
}

function parsePurposeBody(req: Request, res: Response): {
  purpose: UploadPurpose;
  contentType: AllowedContentType;
  farmerTaskId?: string;
  farmerId?: string;
} | null {
  const purpose = req.body?.purpose as UploadPurpose | undefined;
  const contentType = req.body?.contentType as AllowedContentType | undefined;
  const farmerTaskId =
    typeof req.body?.farmerTaskId === 'string' ? req.body.farmerTaskId : undefined;

  if (!purpose || !UPLOAD_PURPOSES.includes(purpose)) {
    res.status(400).json({
      error: `purpose must be one of: ${UPLOAD_PURPOSES.join(', ')}`,
    });
    return null;
  }
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    res.status(400).json({
      error: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
    });
    return null;
  }
  if (purpose === 'task_evidence' && !farmerTaskId?.trim()) {
    res.status(400).json({ error: 'farmerTaskId is required for task_evidence' });
    return null;
  }

  let farmerId: string | undefined;
  if (purpose === 'farmer_profile') {
    farmerId = req.user?.farmerId?.trim();
    if (!farmerId) {
      res.status(400).json({ error: 'No farmer profile linked to this account' });
      return null;
    }
  }

  return { purpose, contentType, farmerTaskId, farmerId };
}

router.post(
  '/presign',
  asyncHandler(async (req, res) => {
    if (!isR2Configured()) {
      res.status(503).json({ error: 'Photo storage is not configured' });
      return;
    }

    const parsed = parsePurposeBody(req, res);
    if (!parsed) return;

    const contentLength =
      typeof req.body?.contentLength === 'number' ? req.body.contentLength : undefined;
    if (contentLength != null && (contentLength <= 0 || contentLength > MAX_UPLOAD_BYTES)) {
      res.status(400).json({ error: `contentLength must be between 1 and ${MAX_UPLOAD_BYTES}` });
      return;
    }

    const permission = permissionForPurpose(parsed.purpose);
    if (!req.user || !hasPermission(req.user.role, permission)) {
      deny(req, res, permission);
      return;
    }

    try {
      const result = await createPresignedUpload({
        purpose: parsed.purpose,
        contentType: parsed.contentType,
        farmerTaskId: parsed.farmerTaskId,
        farmerId: parsed.farmerId,
        contentLength,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create upload URL';
      res.status(400).json({ error: message });
    }
  })
);

router.post(
  '/presign-read',
  asyncHandler(async (req, res) => {
    if (!isR2Configured()) {
      res.status(503).json({ error: 'Photo storage is not configured' });
      return;
    }
    const objectKey = typeof req.body?.objectKey === 'string' ? req.body.objectKey.trim() : '';
    if (!isR2ObjectKey(objectKey)) {
      res.status(400).json({ error: 'Valid objectKey is required' });
      return;
    }
    try {
      const readUrl = await createPresignedReadUrl(objectKey);
      res.json({ readUrl, expiresIn: READ_URL_EXPIRES_SECONDS });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create read URL';
      res.status(400).json({ error: message });
    }
  })
);

/**
 * Direct upload via Express → R2 (avoids browser CORS on R2 PUT).
 * Body: { purpose, contentType, base64, farmerTaskId? }
 */
router.post(
  '/direct',
  asyncHandler(async (req, res) => {
    if (!isR2Configured()) {
      res.status(503).json({ error: 'Photo storage is not configured' });
      return;
    }

    const parsed = parsePurposeBody(req, res);
    if (!parsed) return;

    const permission = permissionForPurpose(parsed.purpose);
    if (!req.user || !hasPermission(req.user.role, permission)) {
      deny(req, res, permission);
      return;
    }

    const base64Raw = typeof req.body?.base64 === 'string' ? req.body.base64 : '';
    const base64 = base64Raw.includes(',') ? base64Raw.split(',').pop()! : base64Raw;
    if (!base64) {
      res.status(400).json({ error: 'base64 photo data is required' });
      return;
    }

    let body: Buffer;
    try {
      body = Buffer.from(base64, 'base64');
    } catch {
      res.status(400).json({ error: 'Invalid base64 photo data' });
      return;
    }

    try {
      const result = await uploadObjectDirect({
        purpose: parsed.purpose,
        contentType: parsed.contentType,
        body,
        farmerTaskId: parsed.farmerTaskId,
        farmerId: parsed.farmerId,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not upload photo';
      res.status(400).json({ error: message });
    }
  })
);

export default router;
