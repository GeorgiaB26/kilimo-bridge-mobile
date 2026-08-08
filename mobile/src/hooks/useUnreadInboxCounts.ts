import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getUnreadMessageCount,
  getUnreadNotificationCount,
  getNotificationSettings,
} from '../api/client';

const POLL_MS = 15000;

export function useUnreadInboxCounts() {
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const load = useCallback(async () => {
    try {
      const settingsRes = await getNotificationSettings();
      const pushOn = Boolean(settingsRes.settings?.push_enabled);
      setNotificationsEnabled(pushOn);

      if (!pushOn) {
        setMessageCount(0);
        setNotificationCount(0);
        return;
      }

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

  return { messageCount, notificationCount, notificationsEnabled, refresh: load };
}
