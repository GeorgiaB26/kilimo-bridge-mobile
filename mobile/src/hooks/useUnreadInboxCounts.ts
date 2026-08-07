import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getUnreadMessageCount, getUnreadNotificationCount } from '../api/client';

const POLL_MS = 15000;

export function useUnreadInboxCounts() {
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [messages, notifications] = await Promise.all([
        getUnreadMessageCount(),
        getUnreadNotificationCount(),
      ]);
      setMessageCount(messages.count ?? 0);
      setNotificationCount(notifications.count ?? 0);
    } catch {
      // API may be offline — keep previous counts
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  return { messageCount, notificationCount, refresh: load };
}
