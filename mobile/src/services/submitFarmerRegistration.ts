import { registerFarmer } from '../api/client';
import type { RegistrationFormData } from '../types';
import { extractApiError } from '../utils/feedback';
import {
  listPendingRegistrations,
  removePendingRegistration,
  savePendingRegistration,
  updatePendingSyncError,
} from './offlineRegistrationQueue';

function makePendingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildPicturePayload(formData: RegistrationFormData, pictureBase64?: string): string | undefined {
  if (pictureBase64) return `data:image/jpeg;base64,${pictureBase64}`;
  return formData.pictureUri;
}

export function isNetworkError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  }
  if (err && typeof err === 'object' && 'response' in err) {
    return !(err as { response?: unknown }).response;
  }
  return false;
}

export async function submitFarmerRegistration(
  formData: RegistrationFormData,
  pictureBase64?: string
): Promise<
  | { mode: 'online'; farmerId?: string; kbFarmerId?: string; key?: string }
  | { mode: 'offline'; pendingId: string }
> {
  const payload: RegistrationFormData = {
    ...formData,
    pictureUri: buildPicturePayload(formData, pictureBase64),
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
    if (!isNetworkError(err)) throw err;
    const pendingId = makePendingId();
    await savePendingRegistration({ id: pendingId, formData, pictureBase64 });
    return { mode: 'offline', pendingId };
  }
}

export async function pushPendingRegistration(pendingId: string): Promise<{ success: boolean; error?: string }> {
  const pending = (await listPendingRegistrations()).find((p) => p.id === pendingId);
  if (!pending) return { success: false, error: 'Registration not found on device' };

  const payload: RegistrationFormData = {
    ...pending.formData,
    pictureUri: buildPicturePayload(pending.formData, pending.pictureBase64),
  };

  try {
    await registerFarmer(payload);
    await removePendingRegistration(pendingId);
    return { success: true };
  } catch (err) {
    const message = extractApiError(err, 'Sync failed');
    if (isNetworkError(err)) {
      await updatePendingSyncError(pendingId, message);
    } else {
      await updatePendingSyncError(pendingId, message);
    }
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
