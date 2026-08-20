import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  getAuthToken,
  getUnreadMessageCount,
  getUnreadNotificationCount,
} from '../api/client';

type InboxCountsState = {
  messageCount: number;
  notificationCount: number;
  refresh: () => Promise<void>;
  reset: () => void;
};

function asCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const useInboxCountsStore = create<InboxCountsState>((set) => ({
  messageCount: 0,
  notificationCount: 0,
  reset: () => set({ messageCount: 0, notificationCount: 0 }),
  refresh: async () => {
    if (!getAuthToken()) return;
    try {
      const [messages, notifications] = await Promise.all([
        getUnreadMessageCount(),
        getUnreadNotificationCount(),
      ]);
      set({
        messageCount: asCount(messages?.count),
        notificationCount: asCount(notifications?.count),
      });
    } catch {
      // API may be offline — keep previous counts
    }
  },
}));

AppState.addEventListener('change', (state) => {
  if (state === 'active') void useInboxCountsStore.getState().refresh();
});
