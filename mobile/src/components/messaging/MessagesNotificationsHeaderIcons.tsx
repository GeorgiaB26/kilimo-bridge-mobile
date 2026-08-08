import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { useUnreadInboxCounts } from '../../hooks/useUnreadInboxCounts';

type Props = {
  messagesRoute?: string;
  notificationsRoute?: string;
  iconColor?: string;
};

export function MessagesNotificationsHeaderIcons({
  messagesRoute = 'MessagesFlow',
  notificationsRoute = 'NotificationsFlow',
  iconColor = '#fff',
}: Props) {
  const navigation = useNavigation();
  const { messageCount, notificationCount } = useUnreadInboxCounts();

  const openFlow = (route: string) => {
    let nav = navigation as NavigationProp<ParamListBase> | undefined;
    while (nav) {
      if (nav.getState().routeNames.includes(route)) {
        nav.navigate(route);
        return;
      }
      nav = nav.getParent();
    }
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => openFlow(messagesRoute)}
        style={styles.hit}
        accessibilityLabel="Messages"
        accessibilityHint="Open messages"
      >
        <Ionicons name="chatbubbles-outline" size={22} color={iconColor} />
        {messageCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{messageCount > 99 ? '99+' : messageCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => openFlow(notificationsRoute)}
        style={styles.hit}
        accessibilityLabel="Notifications"
        accessibilityHint="Open notifications"
      >
        <Ionicons name="notifications-outline" size={22} color={iconColor} />
        {notificationCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hit: {
    padding: 6,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
