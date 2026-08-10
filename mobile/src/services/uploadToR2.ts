import { Platform } from 'react-native';
import { api } from '../api/client';

export type UploadPurpose =
  | 'farmer_registration'
  | 'task_evidence'
  | 'farmer_profile'
  | 'support_attachment';
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface PresignUploadResult {
  uploadUrl: string;
  objectKey: string;
  contentType: UploadContentType;
  expiresIn: number;
  previewUrl: string;
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

export async function requestUploadPresign(params: {
  purpose: UploadPurpose;
  contentType: UploadContentType;
  farmerTaskId?: string;
  contentLength?: number;
}): Promise<PresignUploadResult> {
  const { data } = await api.post<PresignUploadResult>('/uploads/presign', params);
  return data;
}

async function putBytesToR2(
  purpose: UploadPurpose,
  bytes: Uint8Array,
  contentType: UploadContentType,
  farmerTaskId?: string
): Promise<{ objectKey: string; previewUrl: string; contentType: UploadContentType }> {
  assertPhotoBytes(bytes, 'Photo');

  // Web: R2 CORS is configured for known origins (Lovable + localhost:8081–8083), so a
  // browser PUT to a presigned URL can work. We still relay via Express so uploads don't
  // break when Expo picks a new port or a new host is added without updating R2 CORS
  // (API token can't manage CORS — dashboard only).
  if (Platform.OS === 'web') {
    const { data } = await api.post<{
      objectKey: string;
      previewUrl: string;
      contentType: UploadContentType;
      size: number;
    }>('/uploads/direct', {
      purpose,
      contentType,
      farmerTaskId,
      base64: uint8ArrayToBase64(bytes),
    });
    return {
      objectKey: data.objectKey,
      previewUrl: data.previewUrl,
      contentType: data.contentType ?? contentType,
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
    objectKey: presign.objectKey,
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
