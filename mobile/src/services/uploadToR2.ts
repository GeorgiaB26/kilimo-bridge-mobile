import { Platform } from 'react-native';
import { api } from '../api/client';

export type UploadPurpose =
  | 'farmer_registration'
  | 'task_evidence'
  | 'farmer_profile'
  | 'refugee_document'
  | 'support_attachment';
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface PresignUploadResult {
  uploadUrl: string;
  objectKey: string;
  contentType: UploadContentType;
  expiresIn: number;
  previewUrl: string;
}

const R2_KEY_IN_PATH = /(?:^|\/)((?:farmers|tasks|support)\/[A-Za-z0-9/_\-.]+)/;

/** Pull a stored R2 key out of a key, a leading-slash key, or a presigned HTTPS URL. */
export function objectKeyFromUploadValue(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  const withoutQuery = value.split(/[?#]/)[0].replace(/^\/+/, '');
  if (/^(farmers|tasks|support)\//.test(withoutQuery) && !withoutQuery.includes('://')) {
    return withoutQuery;
  }
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    const fromUrl = path.match(R2_KEY_IN_PATH)?.[1];
    if (fromUrl) return fromUrl;
  } catch {
    // not a URL
  }
  const loose = value.match(R2_KEY_IN_PATH)?.[1];
  return loose ?? null;
}

function objectKeyFromUploadPayload(data: Record<string, unknown>): string {
  const candidates = [
    data.objectKey,
    data.object_key,
    data.previewUrl,
    data.preview_url,
    data.uploadUrl,
    data.upload_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const key = objectKeyFromUploadValue(candidate);
    if (key) return key;
  }
  throw new Error('Photo upload did not return a storage key');
}

/** Reject empty / placeholder uploads (the 70-byte smoke-test PNG was this small). */
const MIN_PHOTO_BYTES = 2_000;

function guessContentType(uri: string, mimeType?: string | null): UploadContentType {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/png' || uri.toLowerCase().endsWith('.png')) return 'image/png';
  if (mime === 'image/webp' || uri.toLowerCase().endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function stripDataUrlPrefix(base64OrDataUrl: string): { contentType: UploadContentType; base64: string } {
  const trimmed = base64OrDataUrl.trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(trimmed);
  if (match) {
    const raw = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    return {
      contentType: raw as UploadContentType,
      base64: match[2],
    };
  }
  return { contentType: 'image/jpeg', base64: trimmed };
}

/** Decode base64 to raw bytes — does not use fetch(dataUrl). */
export function base64ToUint8Array(base64OrDataUrl: string): {
  bytes: Uint8Array;
  contentType: UploadContentType;
} {
  const { contentType, base64 } = stripDataUrlPrefix(base64OrDataUrl);
  const binary =
    typeof atob === 'function'
      ? atob(base64)
      : (() => {
          const Buf = (globalThis as { Buffer?: { from(data: string, enc: string): { toString(enc: string): string } } })
            .Buffer;
          if (!Buf) throw new Error('Base64 decode is not available in this environment');
          return Buf.from(base64, 'base64').toString('binary');
        })();
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, contentType };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const Buf = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (Buf) {
    return Buf.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function assertPhotoBytes(bytes: Uint8Array, label: string): void {
  if (bytes.byteLength < MIN_PHOTO_BYTES) {
    throw new Error(
      `${label} is too small (${bytes.byteLength} bytes). The photo did not load correctly — please retake it.`
    );
  }
}

async function uriToBytes(
  uri: string,
  contentType: UploadContentType
): Promise<{ bytes: Uint8Array; contentType: UploadContentType }> {
  if (Platform.OS !== 'web' && (uri.startsWith('file:') || uri.startsWith('content:'))) {
    try {
      const FileSystem = await import('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { bytes } = base64ToUint8Array(`data:${contentType};base64,${base64}`);
      assertPhotoBytes(bytes, 'Photo');
      return { bytes, contentType };
    } catch {
      // fall through
    }
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read the selected photo from the device');
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  assertPhotoBytes(bytes, 'Photo');
  return { bytes, contentType };
}

async function uriToDocumentBytes(uri: string, contentType: UploadContentType): Promise<Uint8Array> {
  if (Platform.OS !== 'web' && (uri.startsWith('file:') || uri.startsWith('content:'))) {
    try {
      const FileSystem = await import('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { bytes } = base64ToUint8Array(`data:${contentType};base64,${base64}`);
      return bytes;
    } catch {
      // fall through
    }
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read the selected document from the device');
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function requestUploadPresign(params: {
  purpose: UploadPurpose;
  contentType: UploadContentType;
  farmerTaskId?: string;
  contentLength?: number;
}): Promise<PresignUploadResult> {
  const { data } = await api.post<PresignUploadResult & Record<string, unknown>>(
    '/uploads/presign',
    params
  );
  const payload = data as Record<string, unknown>;
  const uploadUrl =
    (typeof data.uploadUrl === 'string' && data.uploadUrl) ||
    (typeof payload.upload_url === 'string' && payload.upload_url) ||
    '';
  const previewUrl =
    (typeof data.previewUrl === 'string' && data.previewUrl) ||
    (typeof payload.preview_url === 'string' && payload.preview_url) ||
    '';
  return {
    ...data,
    uploadUrl,
    previewUrl,
    objectKey: objectKeyFromUploadPayload(payload),
  };
}

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

function guessDocumentContentType(uri: string, mimeType?: string | null): UploadContentType {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf' || uri.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (mime === 'image/png' || uri.toLowerCase().endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

async function putDocumentBytesToR2(
  purpose: UploadPurpose,
  bytes: Uint8Array,
  contentType: UploadContentType
): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  return putBytesToR2(purpose, bytes, contentType);
}

export async function uploadRefugeeDocumentToR2(params: {
  localUri?: string | null;
  base64?: string | null;
  mimeType?: string | null;
}): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  if (params.base64?.trim()) {
    const decoded = base64ToUint8Array(params.base64);
    const contentType =
      decoded.contentType === 'application/pdf' ? 'application/pdf' : decoded.contentType;
    return putDocumentBytesToR2('refugee_document', decoded.bytes, contentType);
  }
  if (!params.localUri?.trim()) {
    throw new Error('Refugee document is required before registration can sync');
  }
  const contentType = guessDocumentContentType(params.localUri, params.mimeType);
  const bytes = await uriToDocumentBytes(params.localUri, contentType);
  return putDocumentBytesToR2('refugee_document', bytes, contentType);
}

async function putBytesToR2(
  purpose: UploadPurpose,
  bytes: Uint8Array,
  contentType: UploadContentType,
  farmerTaskId?: string
): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  if (purpose === 'refugee_document') {
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new Error('File is too large (max 5MB). Please compress and try again.');
    }
  } else {
    assertPhotoBytes(bytes, 'Photo');
  }

  // Web: R2 CORS is configured for known origins (Lovable + localhost:8081–8083), so a
  // browser PUT to a presigned URL can work. We still relay via Express so uploads don't
  // break when Expo picks a new port or a new host is added without updating R2 CORS
  // (API token can't manage CORS — dashboard only).
  if (Platform.OS === 'web') {
    const { data } = await api.post<Record<string, unknown>>('/uploads/direct', {
      purpose,
      contentType,
      farmerTaskId,
      base64: uint8ArrayToBase64(bytes),
    });
    return {
      objectKey: objectKeyFromUploadPayload(data),
      previewUrl:
        (typeof data.previewUrl === 'string' && data.previewUrl) ||
        (typeof data.preview_url === 'string' && data.preview_url) ||
        '',
      contentType,
    };
  }

  const presign = await requestUploadPresign({
    purpose,
    contentType,
    farmerTaskId,
    contentLength: bytes.byteLength,
  });

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });

  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    throw new Error(
      detail
        ? `Photo upload failed (${put.status}): ${detail.slice(0, 200)}`
        : `Photo upload failed (${put.status})`
    );
  }

  return {
    objectKey: objectKeyFromUploadPayload(presign as unknown as Record<string, unknown>),
    previewUrl: presign.previewUrl,
    contentType,
  };
}

export async function uploadPhotoToR2(params: {
  purpose: UploadPurpose;
  localUri: string;
  mimeType?: string | null;
  farmerTaskId?: string;
  /** Prefer when available — more reliable than fetch(localUri). */
  base64?: string | null;
}): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  if (params.base64?.trim()) {
    return uploadBase64PhotoToR2({
      purpose: params.purpose,
      base64: params.base64,
      farmerTaskId: params.farmerTaskId,
    });
  }

  const contentType = guessContentType(params.localUri, params.mimeType);
  const { bytes } = await uriToBytes(params.localUri, contentType);
  return putBytesToR2(params.purpose, bytes, contentType, params.farmerTaskId);
}

function isUnsupportedUploadPurposeError(err: unknown): boolean {
  const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
  const message = typeof data?.error === 'string' ? data.error : '';
  return message.startsWith('purpose must be one of');
}

/**
 * Support photos: prefer `support_attachment`. Older APIs (production main) reject
 * that purpose, so fall back to a purpose the signed-in role is already allowed to use.
 */
export async function uploadSupportPhotoToR2(params: {
  localUri: string;
  mimeType?: string | null;
  base64?: string | null;
}): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  const uploaded = await uploadSupportPhotoBytes(params);
  const objectKey = objectKeyFromUploadValue(uploaded.objectKey);
  if (!objectKey) {
    throw new Error('Photo upload did not return a storage key');
  }
  return { ...uploaded, objectKey };
}

async function uploadSupportPhotoBytes(params: {
  localUri: string;
  mimeType?: string | null;
  base64?: string | null;
}): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  try {
    return await uploadPhotoToR2({ ...params, purpose: 'support_attachment' });
  } catch (err) {
    if (!isUnsupportedUploadPurposeError(err)) throw err;
    const { useAuthStore } = await import('../store/authStore');
    const user = useAuthStore.getState().user;
    const fallbackPurpose: UploadPurpose =
      user?.role === 'farmer' || Boolean(user?.farmerId) ? 'farmer_profile' : 'farmer_registration';
    return uploadPhotoToR2({ ...params, purpose: fallbackPurpose });
  }
}

export async function uploadBase64PhotoToR2(params: {
  purpose: UploadPurpose;
  base64: string;
  farmerTaskId?: string;
  contentType?: UploadContentType;
}): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  const decoded = base64ToUint8Array(params.base64);
  const contentType = params.contentType ?? decoded.contentType;
  return putBytesToR2(params.purpose, decoded.bytes, contentType, params.farmerTaskId);
}
