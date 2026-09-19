/**
 * Local disk cache for agent task evidence photos.
 * Stores image bytes (not just signed URLs) so field agents can review submissions offline.
 */
import { Platform } from 'react-native';
import { getOfflineSqliteDb } from './offlineSqlite';
import { getReadCache, READ_CACHE_KEYS } from './offlineReadCache';
import { isSubmittedForApprovalStatus } from '../utils/taskStatus';

const IS_DEV =
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

const MAX_CACHED_PHOTOS = 25;
const DOWNLOAD_CONCURRENCY = 2;

type PhotoRow = {
  user_scope: string;
  task_id: string;
  remote_url: string;
  local_uri: string;
  accessed_at: string;
};

type TaskPhotoCandidate = {
  taskId: string;
  url: string;
  status: string;
};

let photoWarmInFlight: Promise<void> | null = null;

function isRejectedStatus(status: string): boolean {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-') === 'rejected';
}

function photoPriority(status: string): number {
  if (isSubmittedForApprovalStatus(status)) return 0;
  if (isRejectedStatus(status)) return 1;
  return 2;
}

function extFromUrl(url: string): string {
  const path = url.split('?')[0] ?? url;
  if (path.toLowerCase().endsWith('.png')) return 'png';
  if (path.toLowerCase().endsWith('.webp')) return 'webp';
  return 'jpg';
}

function collectCandidates(payload: {
  farmer_tasks?: Array<Record<string, unknown>>;
  personal_tasks?: Array<Record<string, unknown>>;
}): TaskPhotoCandidate[] {
  const rows = [
    ...(payload.farmer_tasks ?? []),
    ...(payload.personal_tasks ?? []),
  ];
  const seen = new Set<string>();
  const out: TaskPhotoCandidate[] = [];
  for (const row of rows) {
    const taskId = row.id != null ? String(row.id) : '';
    const url =
      typeof row.photo_evidence_url === 'string' ? row.photo_evidence_url.trim() : '';
    if (!taskId || !url || seen.has(taskId)) continue;
    if (!url.startsWith('https://') && !url.startsWith('http://')) continue;
    seen.add(taskId);
    out.push({
      taskId,
      url,
      status: String(row.status ?? ''),
    });
  }
  out.sort((a, b) => photoPriority(a.status) - photoPriority(b.status));
  return out.slice(0, MAX_CACHED_PHOTOS);
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists === true;
  } catch {
    return false;
  }
}

async function ensureDir(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const root = FileSystem.documentDirectory;
    if (!root) return null;
    const dir = `${root}task-photos/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

async function evictLru(userScope: string): Promise<void> {
  const db = await getOfflineSqliteDb();
  if (!db) return;
  const rows = await db.getAllAsync<PhotoRow>(
    'SELECT * FROM task_photo_cache WHERE user_scope = ? ORDER BY accessed_at DESC',
    [userScope]
  );
  if (rows.length <= MAX_CACHED_PHOTOS) return;
  const extra = rows.slice(MAX_CACHED_PHOTOS);
  const FileSystem = await import('expo-file-system/legacy').catch(() => null);
  for (const row of extra) {
    if (FileSystem) {
      await FileSystem.deleteAsync(row.local_uri, { idempotent: true }).catch(() => undefined);
    }
    await db.runAsync(
      'DELETE FROM task_photo_cache WHERE user_scope = ? AND task_id = ?',
      [userScope, row.task_id]
    );
  }
}

async function downloadOne(
  userScope: string,
  candidate: TaskPhotoCandidate,
  dir: string
): Promise<void> {
  const db = await getOfflineSqliteDb();
  if (!db) return;

  const existing = await db.getAllAsync<PhotoRow>(
    'SELECT * FROM task_photo_cache WHERE user_scope = ? AND task_id = ? LIMIT 1',
    [userScope, candidate.taskId]
  );
  const current = existing[0];
  if (current && (await fileExists(current.local_uri))) {
    await db.runAsync(
      'UPDATE task_photo_cache SET accessed_at = ? WHERE user_scope = ? AND task_id = ?',
      [new Date().toISOString(), userScope, candidate.taskId]
    );
    return;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const dest = `${dir}${userScope.replace(/[^A-Za-z0-9_-]/g, '_')}_${candidate.taskId}.${extFromUrl(candidate.url)}`;
  const result = await FileSystem.downloadAsync(candidate.url, dest);
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error(`download status ${result.status}`);
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO task_photo_cache
      (user_scope, task_id, remote_url, local_uri, accessed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userScope, candidate.taskId, candidate.url, result.uri, now]
  );
}

/** Prefer a local file URI when cached; otherwise the remote URL (or null). */
export async function getCachedTaskPhotoUri(
  taskId: string,
  remoteUrl?: string | null,
  userScope?: string
): Promise<string | null> {
  const remote = remoteUrl?.trim() || null;
  if (Platform.OS === 'web') return remote;

  try {
    const db = await getOfflineSqliteDb();
    if (!db) return remote;
    const rows = userScope
      ? await db.getAllAsync<PhotoRow>(
          'SELECT * FROM task_photo_cache WHERE user_scope = ? AND task_id = ? LIMIT 1',
          [userScope, taskId]
        )
      : await db.getAllAsync<PhotoRow>(
          'SELECT * FROM task_photo_cache WHERE task_id = ? ORDER BY accessed_at DESC LIMIT 1',
          [taskId]
        );
    const row = rows[0];
    if (row && (await fileExists(row.local_uri))) {
      await db.runAsync(
        'UPDATE task_photo_cache SET accessed_at = ? WHERE user_scope = ? AND task_id = ?',
        [new Date().toISOString(), row.user_scope, row.task_id]
      );
      return row.local_uri;
    }
  } catch (err) {
    if (IS_DEV) {
      console.warn('[task-photo cache] lookup failed', err);
    }
  }
  return remote;
}

/**
 * Download evidence photos for warmed agent tasks. Never throws to callers.
 * Fire-and-forget — does not block JSON warmup or UI.
 */
export function scheduleAgentTaskPhotoWarm(userScope: string): void {
  if (Platform.OS === 'web' || !userScope.trim()) return;
  if (photoWarmInFlight) return;

  photoWarmInFlight = (async () => {
    try {
      const cached = await getReadCache<{
        farmer_tasks?: Array<Record<string, unknown>>;
        personal_tasks?: Array<Record<string, unknown>>;
      }>(READ_CACHE_KEYS.agentTasks, userScope);
      if (!cached) return;

      const candidates = collectCandidates(cached.payload);
      if (candidates.length === 0) return;

      const dir = await ensureDir();
      if (!dir) return;

      let next = 0;
      const workers = Array.from(
        { length: Math.min(DOWNLOAD_CONCURRENCY, candidates.length) },
        async () => {
          while (next < candidates.length) {
            const index = next;
            next += 1;
            try {
              await downloadOne(userScope, candidates[index], dir);
            } catch (err) {
              if (IS_DEV) {
                console.warn(
                  `[task-photo cache] download failed for ${candidates[index].taskId}`,
                  err instanceof Error ? err.message : err
                );
              }
            }
          }
        }
      );
      await Promise.allSettled(workers);
      await evictLru(userScope);
    } catch (err) {
      if (IS_DEV) {
        console.warn('[task-photo cache] warm failed', err);
      }
    } finally {
      photoWarmInFlight = null;
    }
  })();
}
