/**
 * Action-specific outbox payloads + handlers.
 *
 * Adding a new action (e.g. profile_photo) later:
 * 1. Extend OutboxActionType in offlineOutboxTypes.ts
 * 2. Add a payload interface + handler here
 * 3. Register it in ensureOutboxHandlersRegistered()
 * No SQLite schema change required.
 */
import { registerFarmer, submitFarmerTaskCompletion } from '../api/client';
import type { RegistrationFormData } from '../types';
import { extractApiError } from '../utils/feedback';
import type { OutboxActionType, OutboxItem } from './offlineOutboxTypes';
import { uploadBase64PhotoToR2, uploadPhotoToR2 } from './uploadToR2';

export interface FarmerRegistrationOutboxPayload {
  formData: RegistrationFormData;
}

export interface TaskSubmissionOutboxPayload {
  farmerTaskId: string;
  notes: string;
}

export type OutboxHandlerResult = unknown;

export type OutboxHandler = (item: OutboxItem) => Promise<OutboxHandlerResult>;

const handlers = new Map<OutboxActionType, OutboxHandler>();

export function registerOutboxHandler(actionType: OutboxActionType, handler: OutboxHandler): void {
  handlers.set(actionType, handler);
}

export function getOutboxHandler(actionType: OutboxActionType): OutboxHandler | undefined {
  return handlers.get(actionType);
}

function asRegistrationPayload(payload: Record<string, unknown>): FarmerRegistrationOutboxPayload {
  const formData = payload.formData;
  if (!formData || typeof formData !== 'object') {
    throw new Error('Invalid farmer_registration payload: formData is required');
  }
  return { formData: formData as RegistrationFormData };
}

function asTaskPayload(payload: Record<string, unknown>): TaskSubmissionOutboxPayload {
  const farmerTaskId =
    typeof payload.farmerTaskId === 'string' ? payload.farmerTaskId.trim() : '';
  const notes = typeof payload.notes === 'string' ? payload.notes : '';
  if (!farmerTaskId) {
    throw new Error('Invalid task_submission payload: farmerTaskId is required');
  }
  return { farmerTaskId, notes };
}

async function resolvePhotoObjectKey(
  item: OutboxItem,
  purpose: 'farmer_registration' | 'task_evidence',
  farmerTaskId?: string
): Promise<string> {
  if (item.photoBase64?.trim()) {
    const uploaded = await uploadBase64PhotoToR2({
      purpose,
      base64: item.photoBase64,
      farmerTaskId,
    });
    return uploaded.objectKey;
  }
  if (item.photoLocalUri?.trim()) {
    const uri = item.photoLocalUri.trim();
    if (/^(farmers|tasks)\//.test(uri)) {
      return uri;
    }
    if (uri.startsWith('data:')) {
      const uploaded = await uploadBase64PhotoToR2({
        purpose,
        base64: uri,
        farmerTaskId,
      });
      return uploaded.objectKey;
    }
    const uploaded = await uploadPhotoToR2({
      purpose,
      localUri: uri,
      farmerTaskId,
    });
    return uploaded.objectKey;
  }
  throw new Error('A photo is required before this outbox item can sync');
}

async function handleFarmerRegistration(item: OutboxItem): Promise<OutboxHandlerResult> {
  const { formData } = asRegistrationPayload(item.payload);
  const objectKey = await resolvePhotoObjectKey(item, 'farmer_registration');
  return registerFarmer({
    ...formData,
    pictureUri: objectKey,
    pictureBase64: undefined,
  });
}

async function handleTaskSubmission(item: OutboxItem): Promise<OutboxHandlerResult> {
  const { farmerTaskId, notes } = asTaskPayload(item.payload);
  const objectKey = await resolvePhotoObjectKey(item, 'task_evidence', farmerTaskId);
  return submitFarmerTaskCompletion(farmerTaskId, {
    notes: notes.trim() || undefined,
    photo_url: objectKey,
  });
}

let registered = false;

/** Idempotent — call before processOutboxItem / processReadyOutbox. */
export function ensureOutboxHandlersRegistered(): void {
  if (registered) return;
  registerOutboxHandler('farmer_registration', handleFarmerRegistration);
  registerOutboxHandler('task_submission', handleTaskSubmission);
  registered = true;
}

export function formatOutboxHandlerError(err: unknown): string {
  return extractApiError(err, 'Outbox sync failed');
}

/** Connectivity / unreachable backend or R2 — keep item queued. */
export function isLikelyConnectivityError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED') return true;
  }
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const ax = err as { response?: unknown; message?: string };
    if (!ax.response) {
      const msg = (ax.message ?? '').toLowerCase();
      if (msg.includes('network') || msg.includes('timeout')) return true;
    }
  }
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : formatOutboxHandlerError(err);
  const lower = message.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('offline') ||
    lower.includes('internet') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  );
}
