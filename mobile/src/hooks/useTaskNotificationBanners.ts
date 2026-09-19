import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getAppNotifications } from '../api/client';
import type { TaskNotificationBannerItem } from '../components/notifications/TaskNotificationBanner';
import { useReadCacheUserScope } from './useReadCacheUserScope';
import { loadWithReadCache, READ_CACHE_KEYS } from '../services/offlineReadCache';
import {
  applyOfflineNotificationReadState,
  loadNotificationReadOverlay,
  markNotificationReadWithOffline,
  syncPendingNotificationReads,
} from '../services/notificationReadOffline';

const POLL_MS = 10000;

const TASK_CONTEXT_TYPES = new Set(['agent_task', 'task']);
const TASK_TYPES = new Set([
  'task',
  'task_assigned',
  'task_completed',
  'task_started',
  'task_status_updated',
  'info',
  'success',
  'warning',
]);

function isTaskNotification(row: {
  type?: string;
  context_type?: string | null;
  is_read?: boolean;
}): boolean {
  if (row.is_read) return false;
  const type = (row.type ?? '').toLowerCase();
  const context = (row.context_type ?? '').toLowerCase();
  if (TASK_CONTEXT_TYPES.has(context)) return true;
  if (type.includes('task')) return true;
  return TASK_TYPES.has(type);
}

export function useTaskNotificationBanners() {
  const userScope = useReadCacheUserScope();
  const [notifications, setNotifications] = useState<TaskNotificationBannerItem[]>([]);

  const load = useCallback(async () => {
    try {
      await syncPendingNotificationReads(userScope).catch(() => undefined);
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.appNotifications,
        userScope,
        fetchLive: () => getAppNotifications(false),
      });
      const overlay = await loadNotificationReadOverlay(userScope);
      const rows = applyOfflineNotificationReadState(
        (result.data.notifications ?? []) as Array<
          TaskNotificationBannerItem & {
            is_read?: boolean;
            context_type?: string | null;
          }
        >,
        overlay.pendingIds,
        overlay.markAllPending
      );
      setNotifications(
        rows
          .filter(isTaskNotification)
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            title: row.title,
            message: row.message,
            type: row.type,
            created_at: row.created_at,
            context_type: row.context_type,
            context_id: row.context_id,
          }))
      );
    } catch {
      setNotifications([]);
    }
  }, [userScope]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const dismiss = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await markNotificationReadWithOffline(id, userScope);
      } catch {
        await load();
      }
    },
    [load, userScope]
  );

  return { notifications, dismiss, refresh: load };
}
