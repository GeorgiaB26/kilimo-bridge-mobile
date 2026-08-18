import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const UPLOAD_URL_EXPIRES_SECONDS = 10 * 60; // 10 minutes
export const READ_URL_EXPIRES_SECONDS = 60 * 60; // 1 hour
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export type UploadPurpose =
  | 'farmer_registration'
  | 'task_evidence'
  | 'farmer_profile'
  | 'refugee_document';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

let cachedClient: S3Client | null = null;

function getBucket(): string {
  return requiredEnv('CLOUDFLARE_R2_BUCKET_NAME');
}

function getEndpoint(): string {
  return requiredEnv('CLOUDFLARE_R2_ENDPOINT').replace(/\/$/, '');
}

export const R2_ENV_VARS = [
  'CLOUDFLARE_R2_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET_NAME',
  'CLOUDFLARE_R2_ENDPOINT',
] as const;

export function isR2Configured(): boolean {
  return R2_ENV_VARS.every((name) => Boolean(process.env[name]?.trim()));
}

/**
 * Deployment diagnostic: which R2 vars the running process can see.
 * Reports names only — never values — so it is safe to expose on /health.
 * `similarNamesFound` catches typos and stray whitespace in Render env keys.
 */
export function getR2ConfigStatus(): {
  configured: boolean;
  missing: string[];
  similarNamesFound: string[];
} {
  const missing = R2_ENV_VARS.filter((name) => !process.env[name]?.trim());
  const similarNamesFound = Object.keys(process.env)
    .filter((name) => /r2|cloud.?fl/i.test(name))
    .filter((name) => !R2_ENV_VARS.includes(name as (typeof R2_ENV_VARS)[number]))
    .sort();
  return { configured: missing.length === 0, missing, similarNamesFound };
}

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: getEndpoint(),
    credentials: {
      accessKeyId: requiredEnv('CLOUDFLARE_R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
    },
  });
  return cachedClient;
}

function extensionForContentType(contentType: AllowedContentType): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'application/pdf') return 'pdf';
  return 'jpg';
}

export function buildObjectKey(
  purpose: UploadPurpose,
  contentType: AllowedContentType,
  opts?: { farmerTaskId?: string; farmerId?: string }
): string {
  const id = randomUUID();
  const ext = extensionForContentType(contentType);
  if (purpose === 'task_evidence') {
    if (!opts?.farmerTaskId?.trim()) {
      throw new Error('farmerTaskId is required for task_evidence uploads');
    }
    return `tasks/${opts.farmerTaskId.trim()}/${id}.${ext}`;
  }
  if (purpose === 'farmer_profile') {
    if (!opts?.farmerId?.trim()) {
      throw new Error('farmerId is required for farmer_profile uploads');
    }
    return `farmers/${opts.farmerId.trim()}/profile/${id}.${ext}`;
  }
  if (purpose === 'refugee_document') {
    return `farmers/refugee-docs/${id}.${ext}`;
  }
  return `farmers/registration/${id}.${ext}`;
}

/** True if key is a profile photo for this farmer. */
export function isOwnFarmerProfilePhotoKey(objectKey: string, farmerId: string): boolean {
  const prefix = `farmers/${farmerId}/profile/`;
  return objectKey.startsWith(prefix) && isR2ObjectKey(objectKey);
}

/** True if value looks like an R2 object key we store in Postgres. */
export function isR2ObjectKey(value?: string | null): boolean {
  if (!value?.trim()) return false;
  const v = value.trim();
  return /^(farmers|tasks)\//.test(v) && !v.includes('://');
}

/**
 * Extract object key from a stored picture_url / photo_evidence_url value.
 * Accepts raw keys or full R2 endpoint URLs for this bucket.
 */
export function extractR2ObjectKey(stored?: string | null): string | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();
  if (isR2ObjectKey(value)) return value;

  try {
    const endpoint = getEndpoint();
    const bucket = getBucket();
    if (value.startsWith(`${endpoint}/`)) {
      const rest = value.slice(endpoint.length + 1);
      const prefix = `${bucket}/`;
      if (rest.startsWith(prefix)) {
        const key = rest.slice(prefix.length);
        return isR2ObjectKey(key) ? key : null;
      }
    }
  } catch {
    // R2 not configured — cannot parse endpoint URLs
  }
  return null;
}

export async function createPresignedUpload(params: {
  purpose: UploadPurpose;
  contentType: AllowedContentType;
  farmerTaskId?: string;
  farmerId?: string;
  contentLength?: number;
}): Promise<{
  uploadUrl: string;
  objectKey: string;
  contentType: AllowedContentType;
  expiresIn: number;
  previewUrl: string;
}> {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured');
  }
  if (!ALLOWED_CONTENT_TYPES.includes(params.contentType)) {
    throw new Error(`Unsupported content type: ${params.contentType}`);
  }
  if (params.contentLength != null && params.contentLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_BYTES} bytes)`);
  }

  const objectKey = buildObjectKey(params.purpose, params.contentType, {
    farmerTaskId: params.farmerTaskId,
    farmerId: params.farmerId,
  });
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_EXPIRES_SECONDS });
  const previewUrl = await createPresignedReadUrl(objectKey);

  return {
    uploadUrl,
    objectKey,
    contentType: params.contentType,
    expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
    previewUrl,
  };
}

export async function createPresignedReadUrl(objectKey: string): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured');
  }
  if (!isR2ObjectKey(objectKey)) {
    throw new Error('Invalid object key');
  }
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: objectKey,
  });
  return getSignedUrl(client, command, { expiresIn: READ_URL_EXPIRES_SECONDS });
}

/** Server-side upload (used by web clients to avoid R2 bucket CORS on browser PUT). */
export async function uploadObjectDirect(params: {
  purpose: UploadPurpose;
  contentType: AllowedContentType;
  body: Buffer;
  farmerTaskId?: string;
  farmerId?: string;
}): Promise<{ objectKey: string; previewUrl: string; contentType: AllowedContentType; size: number }> {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured');
  }
  if (!ALLOWED_CONTENT_TYPES.includes(params.contentType)) {
    throw new Error(`Unsupported content type: ${params.contentType}`);
  }
  if (params.body.length === 0) {
    throw new Error('Empty photo body');
  }
  if (params.body.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${MAX_UPLOAD_BYTES} bytes)`);
  }
  if (params.body.length < 2000) {
    throw new Error(`Photo is too small (${params.body.length} bytes) — likely corrupt`);
  }

  const objectKey = buildObjectKey(params.purpose, params.contentType, {
    farmerTaskId: params.farmerTaskId,
    farmerId: params.farmerId,
  });
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: objectKey,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
  const previewUrl = await createPresignedReadUrl(objectKey);
  return {
    objectKey,
    previewUrl,
    contentType: params.contentType,
    size: params.body.length,
  };
}

/**
 * For API responses: turn a stored key into a 1-hour signed GET URL.
 * Leaves data URLs, plain http(s) placeholders, and null unchanged.
 */
export async function resolvePhotoUrlForDisplay(
  stored?: string | null
): Promise<string | null> {
  if (!stored?.trim()) return null;
  const value = stored.trim();

  if (
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    // If it's already a full URL pointing at our R2 key path, still re-sign when possible
    const keyFromUrl = extractR2ObjectKey(value);
    if (keyFromUrl && isR2Configured()) {
      try {
        return await createPresignedReadUrl(keyFromUrl);
      } catch {
        return value;
      }
    }
    return value;
  }

  const key = extractR2ObjectKey(value);
  if (!key) return value;

  if (!isR2Configured()) {
    return value;
  }

  try {
    return await createPresignedReadUrl(key);
  } catch {
    return value;
  }
}
