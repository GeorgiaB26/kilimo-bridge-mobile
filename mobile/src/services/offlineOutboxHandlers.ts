/**
 * Action-specific outbox payloads + handlers.
 *
 * Adding a new action (e.g. profile_photo) later:
 * 1. Extend OutboxActionType in offlineOutboxTypes.ts
 * 2. Add a payload interface + handler here
 * 3. Register it in ensureOutboxHandlersRegistered()
 * No SQLite schema change required.
 */
import {
  approveFarmerTask,
  approveInventoryQuality,
  assignFarmersToProgramProject,
  getAdminFarmerTask,
  getAgentFarmerById,
  getCentreInventoryItem,
  getProgramProject,
  registerFarmer,
  rejectFarmerTask,
  submitFarmerTaskCompletion,
  verifyFarmerField,
} from '../api/client';
import type { RegistrationFormData } from '../types';
import { extractApiError } from '../utils/feedback';
import { assertExpected, OutboxNeedsReviewError } from './offlineOutboxExpected';
import type { OutboxActionType, OutboxItem } from './offlineOutboxTypes';
import { uploadBase64PhotoToR2, uploadPhotoToR2 } from './uploadToR2';

export interface FarmerRegistrationOutboxPayload {
  formData: RegistrationFormData;
}

export interface TaskSubmissionOutboxPayload {
  farmerTaskId: string;
  notes: string;
}

export interface TaskApprovalOutboxPayload {
  farmerTaskId: string;
  taskName: string;
  decision: 'approve' | 'reject';
  notes: string;
  rejectionReason: string;
  /** Prior server state that must still hold when syncing. */
  expected: { status: string };
}

/**
 * Field-agent farmer verification.
 * Authoritative pin: farmers.status (must still be pending_field_verification).
 * Decision body uses verification_status verified|rejected → writes farmers.status.
 */
export interface FarmerVerificationOutboxPayload {
  farmerId: string;
  farmerName: string;
  /** Decision sent to API as verification_status. */
  verificationStatus: 'verified' | 'rejected';
  notes: string;
  /** Prior farmers.status that must still hold (normally pending_field_verification). */
  expected: { status: string };
}

/**
 * Centre inventory quality check.
 * Authoritative pin: centre_inventory.quality_status === 'pending'.
 * Decision maps to API approved|rejected (DB stores passed|failed).
 */
export interface CentreQcOutboxPayload {
  inventoryId: string;
  productName: string;
  decision: 'approve' | 'reject';
  qualityNotes: string;
  marketplacePricePerUnit: number | null;
  expected: { quality_status: string };
}

/**
 * Assign farmers to a program project (additive API).
 * Authoritative pin: sorted enrolled farmer_id set at enqueue time.
 * (program_projects.updated_at is not bumped by assign, so set membership is the signal.)
 */
export interface ProjectAssignOutboxPayload {
  projectId: string;
  projectName: string;
  farmerIds: string[];
  expected: { farmerIds: string[] };
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

function asTaskApprovalPayload(payload: Record<string, unknown>): TaskApprovalOutboxPayload {
  const farmerTaskId =
    typeof payload.farmerTaskId === 'string' ? payload.farmerTaskId.trim() : '';
  const decision = payload.decision === 'reject' ? 'reject' : payload.decision === 'approve' ? 'approve' : null;
  const expectedRaw = payload.expected;
  const expectedStatus =
    expectedRaw && typeof expectedRaw === 'object' && typeof (expectedRaw as { status?: unknown }).status === 'string'
      ? (expectedRaw as { status: string }).status.trim()
      : '';
  if (!farmerTaskId) {
    throw new Error('Invalid task_approval payload: farmerTaskId is required');
  }
  if (!decision) {
    throw new Error('Invalid task_approval payload: decision must be approve or reject');
  }
  if (!expectedStatus) {
    throw new Error('Invalid task_approval payload: expected.status is required');
  }
  if (decision === 'reject') {
    const reason =
      typeof payload.rejectionReason === 'string' ? payload.rejectionReason.trim() : '';
    if (!reason) {
      throw new Error('Invalid task_approval payload: rejectionReason is required for reject');
    }
  }
  return {
    farmerTaskId,
    taskName: typeof payload.taskName === 'string' ? payload.taskName : 'Task',
    decision,
    notes: typeof payload.notes === 'string' ? payload.notes : '',
    rejectionReason:
      typeof payload.rejectionReason === 'string' ? payload.rejectionReason.trim() : '',
    expected: { status: expectedStatus },
  };
}

function asFarmerVerificationPayload(
  payload: Record<string, unknown>
): FarmerVerificationOutboxPayload {
  const farmerId = typeof payload.farmerId === 'string' ? payload.farmerId.trim() : '';
  const verificationStatus =
    payload.verificationStatus === 'rejected'
      ? 'rejected'
      : payload.verificationStatus === 'verified'
        ? 'verified'
        : null;
  const expectedRaw = payload.expected;
  const expectedStatus =
    expectedRaw &&
    typeof expectedRaw === 'object' &&
    typeof (expectedRaw as { status?: unknown }).status === 'string'
      ? (expectedRaw as { status: string }).status.trim()
      : '';
  if (!farmerId) {
    throw new Error('Invalid farmer_verification payload: farmerId is required');
  }
  if (!verificationStatus) {
    throw new Error(
      'Invalid farmer_verification payload: verificationStatus must be verified or rejected'
    );
  }
  if (!expectedStatus) {
    throw new Error('Invalid farmer_verification payload: expected.status is required');
  }
  return {
    farmerId,
    farmerName: typeof payload.farmerName === 'string' ? payload.farmerName : 'Farmer',
    verificationStatus,
    notes: typeof payload.notes === 'string' ? payload.notes : '',
    expected: { status: expectedStatus },
  };
}

function asCentreQcPayload(payload: Record<string, unknown>): CentreQcOutboxPayload {
  const inventoryId = typeof payload.inventoryId === 'string' ? payload.inventoryId.trim() : '';
  const decision =
    payload.decision === 'reject' ? 'reject' : payload.decision === 'approve' ? 'approve' : null;
  const expectedRaw = payload.expected;
  const expectedQualityStatus =
    expectedRaw &&
    typeof expectedRaw === 'object' &&
    typeof (expectedRaw as { quality_status?: unknown }).quality_status === 'string'
      ? (expectedRaw as { quality_status: string }).quality_status.trim()
      : '';
  if (!inventoryId) {
    throw new Error('Invalid centre_qc payload: inventoryId is required');
  }
  if (!decision) {
    throw new Error('Invalid centre_qc payload: decision must be approve or reject');
  }
  if (!expectedQualityStatus) {
    throw new Error('Invalid centre_qc payload: expected.quality_status is required');
  }
  const priceRaw = payload.marketplacePricePerUnit;
  const marketplacePricePerUnit =
    typeof priceRaw === 'number' && Number.isFinite(priceRaw)
      ? priceRaw
      : typeof priceRaw === 'string' && priceRaw.trim() && Number.isFinite(Number(priceRaw))
        ? Number(priceRaw)
        : null;
  return {
    inventoryId,
    productName: typeof payload.productName === 'string' ? payload.productName : 'Delivery',
    decision,
    qualityNotes: typeof payload.qualityNotes === 'string' ? payload.qualityNotes : '',
    marketplacePricePerUnit,
    expected: { quality_status: expectedQualityStatus },
  };
}

/** Stable sorted unique farmer ids for set comparison. */
export function sortedFarmerIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function asProjectAssignPayload(payload: Record<string, unknown>): ProjectAssignOutboxPayload {
  const projectId = typeof payload.projectId === 'string' ? payload.projectId.trim() : '';
  const farmerIdsRaw = payload.farmerIds;
  if (!projectId) {
    throw new Error('Invalid project_assign payload: projectId is required');
  }
  if (!Array.isArray(farmerIdsRaw) || farmerIdsRaw.length === 0) {
    throw new Error('Invalid project_assign payload: farmerIds must be a non-empty array');
  }
  const farmerIds = sortedFarmerIds(
    farmerIdsRaw.filter((id): id is string => typeof id === 'string')
  );
  if (farmerIds.length === 0) {
    throw new Error('Invalid project_assign payload: farmerIds must be a non-empty array');
  }
  const expectedRaw = payload.expected;
  if (!expectedRaw || typeof expectedRaw !== 'object') {
    throw new Error('Invalid project_assign payload: expected.farmerIds is required');
  }
  const expectedIdsRaw = (expectedRaw as { farmerIds?: unknown }).farmerIds;
  if (!Array.isArray(expectedIdsRaw)) {
    throw new Error('Invalid project_assign payload: expected.farmerIds must be an array');
  }
  const expectedFarmerIds = sortedFarmerIds(
    expectedIdsRaw.filter((id): id is string => typeof id === 'string')
  );
  return {
    projectId,
    projectName: typeof payload.projectName === 'string' ? payload.projectName : 'Project',
    farmerIds,
    expected: { farmerIds: expectedFarmerIds },
  };
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

async function handleTaskApproval(item: OutboxItem): Promise<OutboxHandlerResult> {
  const payload = asTaskApprovalPayload(item.payload);
  let current: { status?: string; name?: string } | null = null;
  try {
    current = await getAdminFarmerTask(payload.farmerTaskId);
  } catch (err: unknown) {
    const msg = extractApiError(err, '');
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
      throw new OutboxNeedsReviewError(
        `Task "${payload.taskName}" no longer exists on the server. Dismiss this queued ${payload.decision}.`
      );
    }
    throw err;
  }
  if (!current) {
    throw new OutboxNeedsReviewError(
      `Task "${payload.taskName}" no longer exists on the server. Dismiss this queued ${payload.decision}.`
    );
  }

  assertExpected(
    { status: current.status },
    payload.expected,
    { label: `Task "${payload.taskName || current.name || payload.farmerTaskId}"` }
  );

  if (payload.decision === 'approve') {
    return approveFarmerTask(payload.farmerTaskId, payload.notes.trim() || undefined);
  }
  return rejectFarmerTask(payload.farmerTaskId, payload.rejectionReason);
}

async function handleFarmerVerification(item: OutboxItem): Promise<OutboxHandlerResult> {
  const payload = asFarmerVerificationPayload(item.payload);
  let farmer: { status?: string; name?: string } | null = null;
  try {
    const data = await getAgentFarmerById(payload.farmerId);
    farmer = (data?.farmer as { status?: string; name?: string } | undefined) ?? null;
  } catch (err: unknown) {
    const msg = extractApiError(err, '');
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
      throw new OutboxNeedsReviewError(
        `Farmer "${payload.farmerName}" no longer exists or is not visible. Dismiss this queued verification.`
      );
    }
    throw err;
  }
  if (!farmer) {
    throw new OutboxNeedsReviewError(
      `Farmer "${payload.farmerName}" no longer exists or is not visible. Dismiss this queued verification.`
    );
  }

  assertExpected(
    { status: farmer.status },
    payload.expected,
    { label: `Farmer "${payload.farmerName || farmer.name || payload.farmerId}"` }
  );

  return verifyFarmerField(
    payload.farmerId,
    payload.verificationStatus,
    payload.notes.trim() || undefined
  );
}

async function handleCentreQc(item: OutboxItem): Promise<OutboxHandlerResult> {
  const payload = asCentreQcPayload(item.payload);
  let delivery: { quality_status?: string; product_name?: string } | null = null;
  try {
    const data = await getCentreInventoryItem(payload.inventoryId);
    delivery =
      (data?.delivery as { quality_status?: string; product_name?: string } | undefined) ?? null;
  } catch (err: unknown) {
    const msg = extractApiError(err, '');
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
      throw new OutboxNeedsReviewError(
        `Delivery "${payload.productName}" no longer exists. Dismiss this queued QC ${payload.decision}.`
      );
    }
    throw err;
  }
  if (!delivery) {
    throw new OutboxNeedsReviewError(
      `Delivery "${payload.productName}" no longer exists. Dismiss this queued QC ${payload.decision}.`
    );
  }

  assertExpected(
    { quality_status: delivery.quality_status },
    payload.expected,
    {
      label: `Delivery "${payload.productName || delivery.product_name || payload.inventoryId}"`,
    }
  );

  return approveInventoryQuality(payload.inventoryId, {
    quality_status: payload.decision === 'approve' ? 'approved' : 'rejected',
    quality_notes: payload.qualityNotes.trim() || undefined,
    marketplace_price_per_unit:
      payload.decision === 'approve'
        ? (payload.marketplacePricePerUnit ?? undefined)
        : undefined,
  });
}

async function handleProjectAssign(item: OutboxItem): Promise<OutboxHandlerResult> {
  const payload = asProjectAssignPayload(item.payload);
  let project: {
    name?: string;
    farmers?: Array<{ farmer_id?: string }>;
  } | null = null;
  try {
    project = await getProgramProject(payload.projectId);
  } catch (err: unknown) {
    const msg = extractApiError(err, '');
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('404')) {
      throw new OutboxNeedsReviewError(
        `Project "${payload.projectName}" no longer exists. Dismiss this queued farmer assignment.`
      );
    }
    throw err;
  }
  if (!project) {
    throw new OutboxNeedsReviewError(
      `Project "${payload.projectName}" no longer exists. Dismiss this queued farmer assignment.`
    );
  }

  const currentFarmerIds = sortedFarmerIds(
    (project.farmers ?? [])
      .map((f) => f.farmer_id)
      .filter((id): id is string => typeof id === 'string')
  );

  assertExpected(
    { farmerIds: currentFarmerIds },
    payload.expected,
    { label: `Project "${payload.projectName || project.name || payload.projectId}"` }
  );

  return assignFarmersToProgramProject(payload.projectId, payload.farmerIds);
}

let registered = false;

/** Idempotent — call before processOutboxItem / processReadyOutbox. */
export function ensureOutboxHandlersRegistered(): void {
  if (registered) return;
  registerOutboxHandler('farmer_registration', handleFarmerRegistration);
  registerOutboxHandler('task_submission', handleTaskSubmission);
  registerOutboxHandler('task_approval', handleTaskApproval);
  registerOutboxHandler('farmer_verification', handleFarmerVerification);
  registerOutboxHandler('centre_qc', handleCentreQc);
  registerOutboxHandler('project_assign', handleProjectAssign);
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
