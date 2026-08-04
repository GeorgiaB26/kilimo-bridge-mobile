/**
 * Web outbox — AsyncStorage only (Metro resolves this instead of offlineOutbox.ts).
 * Same public API as the native SQLite implementation.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_UPLOADING_MS,
  backoffMsForAttempt,
  isRetryableFailure,
  makeOutboxId,
  type EnqueueOutboxInput,
  type ListOutboxOptions,
  type OutboxItem,
  type OutboxStatus,
  type OutboxStatusCounts,
} from './offlineOutboxTypes';

export type {
  EnqueueOutboxInput,
  ListOutboxOptions,
  OutboxActionType,
  OutboxItem,
  OutboxStatus,
  OutboxStatusCounts,
} from './offlineOutboxTypes';

export {
  OUTBOX_BACKOFF_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_UPLOADING_MS,
  backoffMsForAttempt,
  isRetryableFailure,
  makeOutboxId,
} from './offlineOutboxTypes';

const ASYNC_KEY = 'kilimo_sync_outbox_v1';

function nowIso(): string {
  return new Date().toISOString();
}

async function listAll(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(ASYNC_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as OutboxItem[];
}

async function saveAll(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(ASYNC_KEY, JSON.stringify(items));
}

async function replace(id: string, item: OutboxItem): Promise<void> {
  const items = await listAll();
  await saveAll(items.map((i) => (i.id === id ? item : i)));
}

export async function enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxItem> {
  const createdAt = nowIso();
  const item: OutboxItem = {
    id: input.id?.trim() || makeOutboxId(),
    actionType: input.actionType,
    payload: input.payload ?? {},
    photoLocalUri: input.photoLocalUri?.trim() || null,
    photoBase64: input.photoBase64?.trim() || null,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: createdAt,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    syncedAt: null,
  };
  const items = await listAll();
  await saveAll([item, ...items.filter((i) => i.id !== item.id)]);
  return item;
}

export async function getOutboxItem(id: string): Promise<OutboxItem | null> {
  return (await listAll()).find((i) => i.id === id) ?? null;
}

export async function listOutbox(options: ListOutboxOptions = {}): Promise<OutboxItem[]> {
  const includeSynced = options.includeSynced === true;
  const statusFilter = options.status
    ? Array.isArray(options.status)
      ? options.status
      : [options.status]
    : null;

  let next = await listAll();
  if (!includeSynced) next = next.filter((i) => i.status !== 'synced');
  if (statusFilter) next = next.filter((i) => statusFilter.includes(i.status));
  if (options.actionType) next = next.filter((i) => i.actionType === options.actionType);
  next = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (options.limit != null && options.limit > 0) next = next.slice(0, options.limit);
  return next;
}

export async function listReadyOutbox(limit = 20): Promise<OutboxItem[]> {
  await reclaimStaleUploading();
  const candidates = await listOutbox({
    status: ['pending', 'failed'],
    includeSynced: false,
  });
  const now = Date.now();
  return candidates.filter((i) => isRetryableFailure(i, now)).slice(0, limit);
}

export async function getOutboxStatusCounts(): Promise<OutboxStatusCounts> {
  const items = await listOutbox({ includeSynced: true });
  const now = Date.now();
  const counts: OutboxStatusCounts = {
    pending: 0,
    uploading: 0,
    synced: 0,
    failed: 0,
    needs_review: 0,
    ready: 0,
  };
  for (const item of items) {
    switch (item.status) {
      case 'pending':
      case 'uploading':
      case 'synced':
      case 'failed':
      case 'needs_review':
        counts[item.status] += 1;
        break;
      default:
        break;
    }
    if (isRetryableFailure(item, now)) counts.ready += 1;
  }
  return counts;
}

export async function claimNextOutboxItem(): Promise<OutboxItem | null> {
  const ready = await listReadyOutbox(1);
  if (ready.length === 0) return null;
  return claimOutboxItem(ready[0].id);
}

export async function claimOutboxItem(id: string): Promise<OutboxItem | null> {
  const existing = await getOutboxItem(id);
  if (!existing) return null;
  if (existing.status === 'synced') return null;
  if (existing.status === 'needs_review') return null;
  if (existing.status === 'uploading') return existing;
  if (existing.attemptCount >= OUTBOX_MAX_ATTEMPTS && existing.status === 'failed') {
    return null;
  }

  const updated: OutboxItem = {
    ...existing,
    status: 'uploading',
    nextAttemptAt: null,
    updatedAt: nowIso(),
  };
  await replace(id, updated);
  return updated;
}

export async function markOutboxSynced(id: string): Promise<OutboxItem | null> {
  const existing = await getOutboxItem(id);
  if (!existing) return null;
  const now = nowIso();
  const updated: OutboxItem = {
    ...existing,
    status: 'synced',
    lastError: null,
    nextAttemptAt: null,
    syncedAt: now,
    updatedAt: now,
  };
  await replace(id, updated);
  return updated;
}

export async function markOutboxFailed(id: string, error: string): Promise<OutboxItem | null> {
  const existing = await getOutboxItem(id);
  if (!existing) return null;

  const attemptCount = existing.attemptCount + 1;
  const terminal = attemptCount >= OUTBOX_MAX_ATTEMPTS;
  const delay = backoffMsForAttempt(attemptCount);
  const now = Date.now();
  const updated: OutboxItem = {
    ...existing,
    status: 'failed',
    attemptCount,
    lastError: error.slice(0, 500),
    nextAttemptAt: terminal ? null : new Date(now + delay).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await replace(id, updated);
  return updated;
}

/**
 * Terminal conflict / precondition failure — never auto-retried.
 * Does not increment attemptCount (not a transient failure).
 */
export async function markOutboxNeedsReview(
  id: string,
  message: string
): Promise<OutboxItem | null> {
  const existing = await getOutboxItem(id);
  if (!existing) return null;
  const now = nowIso();
  const updated: OutboxItem = {
    ...existing,
    status: 'needs_review',
    lastError: message.slice(0, 1000),
    nextAttemptAt: null,
    updatedAt: now,
  };
  await replace(id, updated);
  return updated;
}

export async function resetOutboxForManualRetry(id: string): Promise<OutboxItem | null> {
  const existing = await getOutboxItem(id);
  if (!existing || existing.status === 'synced') return null;
  if (existing.status === 'needs_review') return null;
  const now = nowIso();
  const updated: OutboxItem = {
    ...existing,
    status: 'pending',
    nextAttemptAt: now,
    attemptCount: Math.min(existing.attemptCount, OUTBOX_MAX_ATTEMPTS - 1),
    updatedAt: now,
  };
  await replace(id, updated);
  return updated;
}

export async function deleteOutboxItem(id: string): Promise<void> {
  const items = await listAll();
  await saveAll(items.filter((i) => i.id !== id));
}

export async function purgeSyncedOutbox(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const items = await listAll();
  const keep = items.filter((i) => {
    if (i.status !== 'synced') return true;
    const t = i.syncedAt ? new Date(i.syncedAt).getTime() : 0;
    return t > cutoff;
  });
  const removed = items.length - keep.length;
  await saveAll(keep);
  return removed;
}

export async function reclaimStaleUploading(
  olderThanMs = OUTBOX_STALE_UPLOADING_MS
): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const items = await listAll();
  let reclaimed = 0;
  const next = items.map((item) => {
    if (item.status !== 'uploading') return item;
    if (new Date(item.updatedAt).getTime() > cutoff) return item;
    reclaimed += 1;
    const now = nowIso();
    return {
      ...item,
      status: 'pending' as OutboxStatus,
      nextAttemptAt: now,
      updatedAt: now,
      lastError: item.lastError ?? 'Reclaimed after interrupted upload',
    };
  });
  if (reclaimed > 0) await saveAll(next);
  return reclaimed;
}
