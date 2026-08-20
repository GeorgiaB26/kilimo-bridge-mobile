import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useInboxCountsStore } from '../store/inboxCountsStore';

const POLL_MS = 15000;

export function useUnreadInboxCounts() {
  const messageCount = useInboxCountsStore((s) => s.messageCount);
  const notificationCount = useInboxCountsStore((s) => s.notificationCount);
  const refresh = useInboxCountsStore((s) => s.refresh);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), POLL_MS);
      return () => clearInterval(timer);
    }, [refresh])
  );

  return { messageCount, notificationCount, refresh };
}
