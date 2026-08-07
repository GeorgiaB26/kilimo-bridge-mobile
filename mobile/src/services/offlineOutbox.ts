/**
 * General offline sync outbox (native).
 *
 * Schema lives in `kilimo_offline.db` alongside the legacy `pending_registrations`
 * table. Callers should not wire screens to this module until the outbox API is reviewed.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STALE_UPLOADING_MS,
  backoffMsForAttempt,
  isRetryableFailure,
  makeOutboxId,
  pruneOutboxItemsForStorage,
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

const DB_NAME = 'kilimo_offline.db';
const ASYNC_FALLBACK_KEY = 'kilimo_sync_outbox_v1';

type OfflineSqliteDb = {
  execAsync: (sql: string) => Promise<void>;
  getAllAsync: <T>(sql: string, params?: (string | number | null)[]) => Promise<T[]>;
  runAsync: (sql: string, params?: (string | number | null)[]) => Promise<unknown>;
};

type OutboxRow = {
  id: string;
  action_type: string;
  payload_json: string;
  photo_local_uri: string | null;
  photo_base64: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
};

let dbReady = false;
let sqliteDb: OfflineSqliteDb | null = null;

async function initDb(): Promise<void> {
  if (dbReady) return;
  if (Platform.OS === 'web') {
    dbReady = true;
    return;
  }
  try {
    const { openDatabaseAsync } = await import('expo-sqlite');
    const database = await openDatabaseAsync(DB_NAME);
    sqliteDb = database as unknown as OfflineSqliteDb;
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        action_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        photo_local_uri TEXT,
        photo_base64 TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_next
        ON sync_outbox (status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_action
        ON sync_outbox (action_type);
    `);
  } catch {
    sqliteDb = null;
  }
  dbReady = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToItem(row: OutboxRow): OutboxItem {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    actionType: row.action_type as OutboxItem['actionType'],
    payload,
    photoLocalUri: row.photo_local_uri,
    photoBase64: row.photo_base64,
    status: row.status as OutboxStatus,
    attemptCount: Number(row.attempt_count) || 0,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
  };
}

function itemToRow(item: OutboxItem): OutboxRow {
  return {
    id: item.id,
    action_type: item.actionType,
    payload_json: JSON.stringify(item.payload ?? {}),
    photo_local_uri: item.photoLocalUri,
    photo_base64: item.photoBase64,
    status: item.status,
    attempt_count: item.attemptCount,
    next_attempt_at: item.nextAttemptAt,
    last_error: item.lastError,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    synced_at: item.syncedAt,
  };
}

async function listFromAsync(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(ASYNC_FALLBACK_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as OutboxItem[];
}

async function saveToAsync(items: OutboxItem[]): Promise<void> {
  const pruned = pruneOutboxItemsForStorage(items);
  try {
    await AsyncStorage.setItem(ASYNC_FALLBACK_KEY, JSON.stringify(pruned));
  } catch {
    const minimal = pruneOutboxItemsForStorage(pruned, { aggressive: true });
    await AsyncStorage.setItem(ASYNC_FALLBACK_KEY, JSON.stringify(minimal));
  }
}

async function upsertSqlite(item: OutboxItem): Promise<void> {
  if (!sqliteDb) return;
  const row = itemToRow(item);
  await sqliteDb.runAsync(
    `INSERT OR REPLACE INTO sync_outbox (
      id, action_type, payload_json, photo_local_uri, photo_base64,
      status, attempt_count, next_attempt_at, last_error, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.action_type,
      row.payload_json,
      row.photo_local_uri,
      row.photo_base64,
      row.status,
      row.attempt_count,
      row.next_attempt_at,
      row.last_error,
      row.created_at,
      row.updated_at,
      row.synced_at,
    ]
  );
}

/**
 * Enqueue a write for later sync. Photo bytes stay local until a sync worker runs.
 */
export async function enqueueOutbox(input: EnqueueOutboxInput): Promise<OutboxItem> {
  await initDb();
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

  if (!sqliteDb) {
    const items = await listFromAsync();
    const without = items.filter((i) => i.id !== item.id);
    without.unshift(item);
    await saveToAsync(without);
    return item;
  }

  await upsertSqlite(item);
  return item;
}

export async function getOutboxItem(id: string): Promise<OutboxItem | null> {
  await initDb();
  if (!sqliteDb) {
    return (await listFromAsync()).find((i) => i.id === id) ?? null;
  }
  const rows = await sqliteDb.getAllAsync<OutboxRow>(
    'SELECT * FROM sync_outbox WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ? rowToItem(rows[0]) : null;
}

export async function listOutbox(options: ListOutboxOptions = {}): Promise<OutboxItem[]> {
  await initDb();
  const includeSynced = options.includeSynced === true;
  const statusFilter = options.status
    ? Array.isArray(options.status)
      ? options.status
      : [options.status]
    : null;

  const filterItems = (items: OutboxItem[]): OutboxItem[] => {
    let next = items;
    if (!includeSynced) next = next.filter((i) => i.status !== 'synced');
    if (statusFilter) next = next.filter((i) => statusFilter.includes(i.status));
    if (options.actionType) next = next.filter((i) => i.actionType === options.actionType);
    next = [...next].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (options.limit != null && options.limit > 0) next = next.slice(0, options.limit);
    return next;
  };

  if (!sqliteDb) {
    return filterItems(await listFromAsync());
  }

  const rows = await sqliteDb.getAllAsync<OutboxRow>(
    'SELECT * FROM sync_outbox ORDER BY created_at DESC'
  );
  return filterItems(rows.map(rowToItem));
}

/**
 * Items eligible for automatic processing right now
 * (pending/failed, under max attempts, nextAttemptAt <= now).
 */
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

/**
 * Atomically claim the next ready item (status → uploading).
 * Returns null if nothing is ready.
 */
export async function claimNextOutboxItem(): Promise<OutboxItem | null> {
  const ready = await listReadyOutbox(1);
  if (ready.length === 0) return null;
  return claimOutboxItem(ready[0].id);
}

/**
 * Claim a specific item for processing (status → uploading).
 * Used by manual "Push" and by claimNextOutboxItem.
 * Respects terminal failed (max attempts); ignores backoff delay (manual force).
 */
export async function claimOutboxItem(id: string): Promise<OutboxItem | null> {
  await initDb();
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

  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? updated : i)));
    return updated;
  }
  await upsertSqlite(updated);
  return updated;
}

export async function markOutboxSynced(id: string): Promise<OutboxItem | null> {
  await initDb();
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
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? updated : i)));
    return updated;
  }
  await upsertSqlite(updated);
  return updated;
}

/**
 * Record a failed attempt and schedule backoff.
 * When attemptCount reaches OUTBOX_MAX_ATTEMPTS, nextAttemptAt is cleared (terminal until manual retry).
 */
export async function markOutboxFailed(id: string, error: string): Promise<OutboxItem | null> {
  await initDb();
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

  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? updated : i)));
    return updated;
  }
  await upsertSqlite(updated);
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
  await initDb();
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
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? updated : i)));
    return updated;
  }
  await upsertSqlite(updated);
  return updated;
}

/** Manual retry: reset scheduling without clearing attempt history. */
export async function resetOutboxForManualRetry(id: string): Promise<OutboxItem | null> {
  await initDb();
  const existing = await getOutboxItem(id);
  if (!existing || existing.status === 'synced') return null;
  // Conflicts stay terminal until dismissed — do not convert to pending.
  if (existing.status === 'needs_review') return null;
  const now = nowIso();
  const updated: OutboxItem = {
    ...existing,
    status: 'pending',
    nextAttemptAt: now,
    // Allow another batch of auto-retries after user taps Push
    attemptCount: Math.min(existing.attemptCount, OUTBOX_MAX_ATTEMPTS - 1),
    updatedAt: now,
  };
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.map((i) => (i.id === id ? updated : i)));
    return updated;
  }
  await upsertSqlite(updated);
  return updated;
}

export async function deleteOutboxItem(id: string): Promise<void> {
  await initDb();
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items.filter((i) => i.id !== id));
    return;
  }
  await sqliteDb.runAsync('DELETE FROM sync_outbox WHERE id = ?', [id]);
}

/** Remove synced rows older than `olderThanMs` (default 7 days). */
export async function purgeSyncedOutbox(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  await initDb();
  const cutoff = Date.now() - olderThanMs;
  if (!sqliteDb) {
    const items = await listFromAsync();
    const keep = items.filter((i) => {
      if (i.status !== 'synced') return true;
      const t = i.syncedAt ? new Date(i.syncedAt).getTime() : 0;
      return t > cutoff;
    });
    const removed = items.length - keep.length;
    await saveToAsync(keep);
    return removed;
  }
  const rows = await sqliteDb.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox WHERE status = 'synced'`
  );
  let removed = 0;
  for (const row of rows) {
    const t = row.synced_at ? new Date(row.synced_at).getTime() : 0;
    if (t <= cutoff) {
      await sqliteDb.runAsync('DELETE FROM sync_outbox WHERE id = ?', [row.id]);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Crash recovery: uploading rows stuck longer than OUTBOX_STALE_UPLOADING_MS → pending.
 */
export async function reclaimStaleUploading(
  olderThanMs = OUTBOX_STALE_UPLOADING_MS
): Promise<number> {
  await initDb();
  const cutoff = Date.now() - olderThanMs;
  const uploading = await listOutbox({ status: 'uploading', includeSynced: false });
  let reclaimed = 0;
  for (const item of uploading) {
    const updatedAt = new Date(item.updatedAt).getTime();
    if (updatedAt > cutoff) continue;
    const now = nowIso();
    const updated: OutboxItem = {
      ...item,
      status: 'pending',
      nextAttemptAt: now,
      updatedAt: now,
      lastError: item.lastError ?? 'Reclaimed after interrupted upload',
    };
    if (!sqliteDb) {
      const items = await listFromAsync();
      await saveToAsync(items.map((i) => (i.id === item.id ? updated : i)));
    } else {
      await upsertSqlite(updated);
    }
    reclaimed += 1;
  }
  return reclaimed;
}

/** Trim synced / oversized queue rows (AsyncStorage fallback on web builds). */
export async function pruneOutboxStorage(): Promise<void> {
  await purgeSyncedOutbox(0);
  if (!sqliteDb) {
    const items = await listFromAsync();
    await saveToAsync(items);
  }
}
