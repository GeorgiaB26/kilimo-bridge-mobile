/**
 * Shared types for the offline sync outbox.
 * Native uses SQLite (`sync_outbox`); web uses AsyncStorage with the same shape.
 */

/** Extensible set of queued write actions — add new types without altering SQLite schema. */
export type OutboxActionType =
  | 'farmer_registration'
  | 'task_submission'
  | 'task_approval'
  | 'agent_task_approval'
  | 'task_recall'
  | 'task_start'
  | 'farmer_verification'
  | 'centre_qc'
  | 'project_assign'
  | 'agent_task_create'
  | 'agent_task_status_update';

/**
 * Lifecycle:
 * - pending      — waiting (or ready after enqueue / reclaim)
 * - uploading    — claimed by a sync worker
 * - synced       — successfully pushed to R2 + API
 * - failed       — last attempt failed; may still be retryable if nextAttemptAt is set
 * - needs_review — conflict / precondition failed; terminal until user dismisses (no auto-retry)
 */
export type OutboxStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'needs_review';

export interface OutboxItem {
  id: string;
  actionType: OutboxActionType;
  /** Action-specific JSON (form fields, task id, notes, etc.). */
  payload: Record<string, unknown>;
  /** Device-local photo path when available (preferred over base64). */
  photoLocalUri: string | null;
  /** Fallback when only ImagePicker base64 is available. */
  photoBase64: string | null;
  status: OutboxStatus;
  attemptCount: number;
  /** ISO timestamp; null means not scheduled (terminal failed, or just claimed). */
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface EnqueueOutboxInput {
  actionType: OutboxActionType;
  payload: Record<string, unknown>;
  photoLocalUri?: string | null;
  photoBase64?: string | null;
  /** Optional stable id; generated if omitted. */
  id?: string;
}

export interface ListOutboxOptions {
  status?: OutboxStatus | OutboxStatus[];
  actionType?: OutboxActionType;
  /** Default false — synced rows are omitted unless true. */
  includeSynced?: boolean;
  limit?: number;
}

export interface OutboxStatusCounts {
  pending: number;
  uploading: number;
  synced: number;
  failed: number;
  needs_review: number;
  /** Ready now: pending/failed with nextAttemptAt <= now and under max attempts. */
  ready: number;
}

/** Max auto-retries before an item stays failed until manual retry. */
export const OUTBOX_MAX_ATTEMPTS = 10;

/** Backoff delays after consecutive failures (ms). Caps at last entry. */
export const OUTBOX_BACKOFF_MS = [
  30_000, // 30s
  60_000, // 1m
  2 * 60_000, // 2m
  5 * 60_000, // 5m
  15 * 60_000, // 15m
  60 * 60_000, // 1h
] as const;

/** Uploading rows older than this are reclaimed as pending (crash recovery). */
export const OUTBOX_STALE_UPLOADING_MS = 5 * 60_000;

export function makeOutboxId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function backoffMsForAttempt(attemptCountAfterFailure: number): number {
  const idx = Math.min(
    Math.max(attemptCountAfterFailure - 1, 0),
    OUTBOX_BACKOFF_MS.length - 1
  );
  return OUTBOX_BACKOFF_MS[idx];
}

export function isRetryableFailure(item: OutboxItem, now = Date.now()): boolean {
  if (
    item.status === 'synced' ||
    item.status === 'uploading' ||
    item.status === 'needs_review'
  ) {
    return false;
  }
  if (item.attemptCount >= OUTBOX_MAX_ATTEMPTS) return false;
  if (!item.nextAttemptAt) return item.status === 'pending';
  return new Date(item.nextAttemptAt).getTime() <= now;
}

/** Max queued rows kept in web localStorage / AsyncStorage fallback. */
export const OUTBOX_MAX_STORED_ITEMS = 10;

/** Drop synced rows and cap queue size to avoid localStorage quota errors on web. */
export function pruneOutboxItemsForStorage(
  items: OutboxItem[],
  options?: { maxItems?: number; aggressive?: boolean }
): OutboxItem[] {
  const maxItems = options?.aggressive ? 5 : (options?.maxItems ?? OUTBOX_MAX_STORED_ITEMS);
  let next = items.filter((i) => i.status !== 'synced');
  next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (next.length > maxItems) next = next.slice(0, maxItems);
  return next.map((item) => {
    if (!item.photoLocalUri || !item.photoBase64) return item;
    return { ...item, photoBase64: null };
  });
}
