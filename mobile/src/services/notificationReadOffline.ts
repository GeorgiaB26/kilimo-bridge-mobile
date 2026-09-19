import AsyncStorage from '@react-native-async-storage/async-storage';
import { markAllNotificationsRead, markNotificationRead } from '../api/client';
import { useInboxCountsStore } from '../store/inboxCountsStore';
import { getReadCacheUserScope } from '../hooks/useReadCacheUserScope';
import { getReadCache, putReadCache, READ_CACHE_KEYS } from './offlineReadCache';
import { isLikelyConnectivityError } from './offlineOutboxHandlers';

const PENDING_READS_KEY = 'kilimo_notification_pending_reads_v1';
const MARK_ALL_PENDING_KEY = 'kilimo_notification_mark_all_pending_v1';

type PendingReadsStore = Record<string, string[]>;
type MarkAllPendingStore = Record<string, boolean>;

export type CachedNotificationRow = {
  id: string;
  is_read?: boolean;
  created_at?: string;
  title?: string;
  message?: string;
  type?: string;
  context_type?: string | null;
  context_id?: string | null;
  action_url?: string | null;
};

type NotificationsPayload = { notifications?: CachedNotificationRow[] };

async function loadPendingReadsStore(): Promise<PendingReadsStore> {
  const raw = await AsyncStorage.getItem(PENDING_READS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PendingReadsStore;
  } catch {
    return {};
  }
}

async function savePendingReadsStore(store: PendingReadsStore): Promise<void> {
  await AsyncStorage.setItem(PENDING_READS_KEY, JSON.stringify(store));
}

async function loadMarkAllPendingStore(): Promise<MarkAllPendingStore> {
  const raw = await AsyncStorage.getItem(MARK_ALL_PENDING_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MarkAllPendingStore;
  } catch {
    return {};
  }
}

async function saveMarkAllPendingStore(store: MarkAllPendingStore): Promise<void> {
  await AsyncStorage.setItem(MARK_ALL_PENDING_KEY, JSON.stringify(store));
}

export async function getPendingNotificationReadIds(userScope: string): Promise<Set<string>> {
  const store = await loadPendingReadsStore();
  return new Set(store[userScope] ?? []);
}

export async function isMarkAllNotificationsReadPending(userScope: string): Promise<boolean> {
  const store = await loadMarkAllPendingStore();
  return store[userScope] === true;
}

async function addPendingNotificationRead(userScope: string, id: string): Promise<void> {
  const store = await loadPendingReadsStore();
  const existing = new Set(store[userScope] ?? []);
  existing.add(id);
  store[userScope] = [...existing];
  await savePendingReadsStore(store);
}

async function removePendingNotificationRead(userScope: string, id: string): Promise<void> {
  const store = await loadPendingReadsStore();
  const existing = new Set(store[userScope] ?? []);
  existing.delete(id);
  if (existing.size === 0) {
    delete store[userScope];
  } else {
    store[userScope] = [...existing];
  }
  await savePendingReadsStore(store);
}

async function clearPendingNotificationReads(userScope: string): Promise<void> {
  const store = await loadPendingReadsStore();
  delete store[userScope];
  await savePendingReadsStore(store);
}

async function setMarkAllNotificationsReadPending(
  userScope: string,
  pending: boolean
): Promise<void> {
  const store = await loadMarkAllPendingStore();
  if (pending) {
    store[userScope] = true;
  } else {
    delete store[userScope];
  }
  await saveMarkAllPendingStore(store);
}

export async function patchNotificationsReadCache(
  userScope: string,
  patch: (notifications: CachedNotificationRow[]) => CachedNotificationRow[]
): Promise<void> {
  const cached = await getReadCache<NotificationsPayload>(
    READ_CACHE_KEYS.appNotifications,
    userScope
  );
  if (!cached) return;
  const notifications = cached.payload.notifications ?? [];
  await putReadCache(
    READ_CACHE_KEYS.appNotifications,
    { notifications: patch(notifications) },
    userScope
  );
}

export function applyOfflineNotificationReadState<T extends { id: string; is_read?: boolean }>(
  notifications: T[],
  pendingIds: Set<string>,
  markAllPending: boolean
): T[] {
  if (!markAllPending && pendingIds.size === 0) return notifications;
  return notifications.map((notification) => {
    if (markAllPending || pendingIds.has(notification.id)) {
      return { ...notification, is_read: true };
    }
    return notification;
  });
}

export async function loadNotificationReadOverlay(userScope: string): Promise<{
  pendingIds: Set<string>;
  markAllPending: boolean;
}> {
  return {
    pendingIds: await getPendingNotificationReadIds(userScope),
    markAllPending: await isMarkAllNotificationsReadPending(userScope),
  };
}

function decrementUnreadNotificationCount(): void {
  useInboxCountsStore.setState((state) => ({
    notificationCount: Math.max(0, state.notificationCount - 1),
  }));
}

export async function markNotificationReadWithOffline(
  notificationId: string,
  userScope: string
): Promise<{ synced: boolean }> {
  await patchNotificationsReadCache(userScope, (notifications) =>
    notifications.map((notification) =>
      notification.id === notificationId ? { ...notification, is_read: true } : notification
    )
  );
  await addPendingNotificationRead(userScope, notificationId);
  decrementUnreadNotificationCount();

  try {
    await markNotificationRead(notificationId);
    await removePendingNotificationRead(userScope, notificationId);
    return { synced: true };
  } catch (err) {
    if (isLikelyConnectivityError(err)) {
      return { synced: false };
    }
    await removePendingNotificationRead(userScope, notificationId);
    throw err;
  }
}

export async function markAllNotificationsReadWithOffline(
  userScope: string
): Promise<{ synced: boolean }> {
  await patchNotificationsReadCache(userScope, (notifications) =>
    notifications.map((notification) => ({ ...notification, is_read: true }))
  );
  await clearPendingNotificationReads(userScope);
  await setMarkAllNotificationsReadPending(userScope, true);
  useInboxCountsStore.setState({ notificationCount: 0 });

  try {
    await markAllNotificationsRead();
    await setMarkAllNotificationsReadPending(userScope, false);
    return { synced: true };
  } catch (err) {
    if (isLikelyConnectivityError(err)) {
      return { synced: false };
    }
    await setMarkAllNotificationsReadPending(userScope, false);
    throw err;
  }
}

export async function syncPendingNotificationReads(
  userScope = getReadCacheUserScope()
): Promise<void> {
  if (!userScope || userScope === 'anon') return;

  const markAllPending = await isMarkAllNotificationsReadPending(userScope);
  if (markAllPending) {
    try {
      await markAllNotificationsRead();
      await setMarkAllNotificationsReadPending(userScope, false);
      await useInboxCountsStore.getState().refresh();
    } catch {
      return;
    }
    return;
  }

  const pendingIds = await getPendingNotificationReadIds(userScope);
  for (const id of pendingIds) {
    try {
      await markNotificationRead(id);
      await removePendingNotificationRead(userScope, id);
    } catch (err) {
      if (isLikelyConnectivityError(err)) return;
    }
  }
  await useInboxCountsStore.getState().refresh();
}
