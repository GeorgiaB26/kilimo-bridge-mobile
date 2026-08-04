import type { RegistrationFormData } from '../types';
import { extractApiError } from '../utils/feedback';
import {
  deleteOutboxItem,
  enqueueOutbox,
  listOutbox,
  type OutboxItem,
} from './offlineOutbox';
import { isLikelyConnectivityError } from './offlineOutboxHandlers';
import { processOutboxItem } from './offlineOutboxProcessor';
import {
  listPendingRegistrations,
  removePendingRegistration,
} from './offlineRegistrationQueue';

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

function formDataWithoutPhoto(formData: RegistrationFormData): RegistrationFormData {
  const { pictureBase64: _b, pictureUri: _u, ...rest } = formData;
  return { ...rest };
}

function resolveLocalPhoto(
  formData: RegistrationFormData,
  pictureBase64?: string
): { photoBase64: string | null; photoLocalUri: string | null } {
  const base64 =
    pictureBase64?.trim() ||
    formData.pictureBase64?.trim() ||
    (formData.pictureUri?.startsWith('data:') ? formData.pictureUri : null) ||
    null;

  const uri = formData.pictureUri?.trim() || null;
  const localUri =
    uri &&
    !uri.startsWith('data:') &&
    !/^(farmers|tasks)\//.test(uri)
      ? uri
      : null;

  return {
    photoBase64: base64,
    photoLocalUri: localUri,
  };
}

export type PendingRegistrationView = {
  id: string;
  formData: RegistrationFormData;
  createdAt: string;
  syncError?: string;
  status: OutboxItem['status'];
};

function outboxItemToPendingView(item: OutboxItem): PendingRegistrationView {
  const formData =
    item.payload.formData && typeof item.payload.formData === 'object'
      ? (item.payload.formData as RegistrationFormData)
      : ({ name: '', phone: '' } as RegistrationFormData);
  return {
    id: item.id,
    formData,
    createdAt: item.createdAt,
    syncError: item.lastError ?? undefined,
    status: item.status,
  };
}

/** One-time move of legacy pending_registrations rows into sync_outbox. */
export async function migrateLegacyPendingRegistrationsToOutbox(): Promise<number> {
  const legacy = await listPendingRegistrations();
  let moved = 0;
  for (const row of legacy) {
    const photo = resolveLocalPhoto(row.formData, row.pictureBase64);
    await enqueueOutbox({
      id: row.id,
      actionType: 'farmer_registration',
      payload: { formData: formDataWithoutPhoto(row.formData) },
      photoBase64: photo.photoBase64 ?? row.pictureBase64 ?? null,
      photoLocalUri: photo.photoLocalUri,
    });
    await removePendingRegistration(row.id);
    moved += 1;
  }
  return moved;
}

export async function listPendingRegistrationOutbox(): Promise<PendingRegistrationView[]> {
  await migrateLegacyPendingRegistrationsToOutbox();
  const items = await listOutbox({
    actionType: 'farmer_registration',
    includeSynced: false,
  });
  return items.map(outboxItemToPendingView);
}

/**
 * Enqueue-first registration: persist locally (including photo), then try sync.
 * Connectivity failures leave the row queued; other failures remove it and throw.
 */
export async function submitFarmerRegistration(
  formData: RegistrationFormData,
  pictureBase64?: string
): Promise<
  | { mode: 'online'; farmerId?: string; kbFarmerId?: string; key?: string }
  | { mode: 'offline'; pendingId: string }
> {
  const photo = resolveLocalPhoto(formData, pictureBase64);
  if (!photo.photoBase64 && !photo.photoLocalUri) {
    throw new Error('A verification photo is required before registration');
  }

  const item = await enqueueOutbox({
    actionType: 'farmer_registration',
    payload: { formData: formDataWithoutPhoto(formData) },
    photoBase64: photo.photoBase64,
    photoLocalUri: photo.photoLocalUri,
  });

  const result = await processOutboxItem(item.id);

  if (result.ok) {
    const data = (result.data ?? {}) as {
      farmerId?: string;
      kbFarmerId?: string;
      key?: string;
    };
    return {
      mode: 'online',
      farmerId: data.farmerId,
      kbFarmerId: data.kbFarmerId,
      key: data.key,
    };
  }

  if (result.skipped) {
    throw new Error(result.error || 'Could not queue registration');
  }

  if (result.connectivity || isLikelyConnectivityError(result.error)) {
    return { mode: 'offline', pendingId: item.id };
  }

  // Business / validation / non-network error — don't leave a stuck queue row
  await deleteOutboxItem(item.id);
  throw new Error(result.error || extractApiError(undefined, 'Registration failed'));
}

export async function pushPendingRegistration(
  pendingId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await processOutboxItem(pendingId);
  if (result.ok) return { success: true };
  return { success: false, error: result.error || 'Sync failed' };
}

/** On Farmers-tab focus: try every queued registration (manual-style claim, ignores backoff). */
export async function syncAllPendingRegistrations(): Promise<{ synced: number; failed: number }> {
  await migrateLegacyPendingRegistrationsToOutbox();
  const items = await listOutbox({
    actionType: 'farmer_registration',
    includeSynced: false,
  });
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    const result = await processOutboxItem(item.id);
    if (result.ok) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
