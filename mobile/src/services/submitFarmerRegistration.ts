import { registerFarmer } from '../api/client';
import type { RegistrationFormData } from '../types';
import { extractApiError } from '../utils/feedback';
import {
  listPendingRegistrations,
  removePendingRegistration,
  savePendingRegistration,
  updatePendingSyncError,
} from './offlineRegistrationQueue';
import { uploadBase64PhotoToR2, uploadPhotoToR2 } from './uploadToR2';

function makePendingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** True only for backend unreachable — NOT for R2/CORS/upload failures. */
export function isBackendNetworkError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  }
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const ax = err as { response?: unknown; message?: string };
    if (!ax.response) {
      const msg = (ax.message ?? '').toLowerCase();
      return msg.includes('network') || msg.includes('timeout');
    }
  }
  return false;
}

/** @deprecated use isBackendNetworkError — kept for callers that imported the old name */
export function isNetworkError(err: unknown): boolean {
  return isBackendNetworkError(err);
}

async function resolveRegistrationPicture(
  formData: RegistrationFormData,
  pictureBase64?: string
): Promise<string> {
  if (formData.pictureUri && /^(farmers|tasks)\//.test(formData.pictureUri)) {
    return formData.pictureUri;
  }

  // Prefer base64 from ImagePicker — avoids empty/corrupt blobs from fetch(localUri) on web.
  if (pictureBase64?.trim()) {
    const uploaded = await uploadBase64PhotoToR2({
      purpose: 'farmer_registration',
      base64: pictureBase64,
    });
    return uploaded.objectKey;
  }

  if (formData.pictureUri && !formData.pictureUri.startsWith('data:')) {
    const uploaded = await uploadPhotoToR2({
      purpose: 'farmer_registration',
      localUri: formData.pictureUri,
    });
    return uploaded.objectKey;
  }

  if (formData.pictureUri?.startsWith('data:')) {
    const uploaded = await uploadBase64PhotoToR2({
      purpose: 'farmer_registration',
      base64: formData.pictureUri,
    });
    return uploaded.objectKey;
  }

  throw new Error('A verification photo is required before registration');
}

export async function submitFarmerRegistration(
  formData: RegistrationFormData,
  pictureBase64?: string
): Promise<
  | { mode: 'online'; farmerId?: string; kbFarmerId?: string; key?: string }
  | { mode: 'offline'; pendingId: string }
> {
  let objectKey: string;
  try {
    objectKey = await resolveRegistrationPicture(formData, pictureBase64);
  } catch (err) {
    // Photo upload failed (CORS, corrupt bytes, R2, etc.) — do NOT pretend we're offline.
    throw err instanceof Error
      ? err
      : new Error(extractApiError(err, 'Photo upload failed'));
  }

  const payload: RegistrationFormData = {
    ...formData,
    pictureUri: objectKey,
  };

  try {
    const result = await registerFarmer(payload);
    return {
      mode: 'online',
      farmerId: result.farmerId,
      kbFarmerId: result.kbFarmerId,
      key: result.key,
    };
  } catch (err) {
    if (!isBackendNetworkError(err)) throw err;
    const pendingId = makePendingId();
    await savePendingRegistration({ id: pendingId, formData, pictureBase64 });
    return { mode: 'offline', pendingId };
  }
}

export async function pushPendingRegistration(pendingId: string): Promise<{ success: boolean; error?: string }> {
  const pending = (await listPendingRegistrations()).find((p) => p.id === pendingId);
  if (!pending) return { success: false, error: 'Registration not found on device' };

  try {
    const objectKey = await resolveRegistrationPicture(pending.formData, pending.pictureBase64);
    const payload: RegistrationFormData = {
      ...pending.formData,
      pictureUri: objectKey,
    };
    await registerFarmer(payload);
    await removePendingRegistration(pendingId);
    return { success: true };
  } catch (err) {
    const message = extractApiError(err, 'Sync failed');
    await updatePendingSyncError(pendingId, message);
    return { success: false, error: message };
  }
}

export async function syncAllPendingRegistrations(): Promise<{ synced: number; failed: number }> {
  const pending = await listPendingRegistrations();
  let synced = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await pushPendingRegistration(item.id);
    if (result.success) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
