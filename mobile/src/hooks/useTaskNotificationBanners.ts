import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getAppNotifications, markNotificationRead } from '../api/client';
import type { TaskNotificationBannerItem } from '../components/notifications/TaskNotificationBanner';

const POLL_MS = 10000;

const TASK_CONTEXT_TYPES = new Set(['agent_task', 'task']);
const TASK_TYPES = new Set([
  'task',
  'task_assigned',
  'task_completed',
  'task_started',
  'task_status_updated',
  'task_qc_failed',
  'task_rejected',
  'error',
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
  const [notifications, setNotifications] = useState<TaskNotificationBannerItem[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getAppNotifications(true);
      const rows = (data.notifications ?? []) as Array<
        TaskNotificationBannerItem & {
          is_read?: boolean;
          context_type?: string | null;
        }
      >;
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await markNotificationRead(id);
    } catch {
      await load();
    }
  }, [load]);

  return { notifications, dismiss, refresh: load };
}
