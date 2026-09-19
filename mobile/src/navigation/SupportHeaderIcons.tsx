import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import { getSupportStats } from '../api/client';

export const SUPPORT_BLUE = '#1F4E78';

/** Header icons for KB Support — Messages opens the tickets tab; badge is unread open tickets. */
export function SupportHeaderIcons() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [unreadOpen, setUnreadOpen] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const data = await getSupportStats();
          if (!cancelled) setUnreadOpen(data.stats?.unread_open ?? 0);
        } catch {
          // keep previous
        }
      };
      load();
      const timer = setInterval(load, 15000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [])
  );

  const openSupportInbox = () => {
    let nav: NavigationProp<ParamListBase> | undefined = navigation;
    while (nav) {
      const names = nav.getState()?.routeNames ?? [];
      if (names.includes('Messages') && names.includes('Dashboard')) {
        nav.navigate('Messages', {
          screen: 'SupportTicketsList',
          params: { statusFilter: 'open' },
        });
        return;
      }
      nav = nav.getParent();
    }
  };

  return (
    <View style={{ marginRight: 16 }}>
      <MessagesNotificationsHeaderIcons
        iconColor="#fff"
        messageCountOverride={unreadOpen}
        onMessagesPress={openSupportInbox}
      />
    </View>
  );
}
