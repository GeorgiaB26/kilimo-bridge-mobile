import React from 'react';
import { Pressable, View, StyleSheet, Text as RNText } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useUnreadInboxCounts } from '../../hooks/useUnreadInboxCounts';

type Props = {
  messagesRoute?: string;
  notificationsRoute?: string;
  iconColor?: string;
  /** Optional settings gear (same size/spacing as messages & notifications). */
  onSettingsPress?: () => void;
};

function UnreadBadge({ count }: { count: number }) {
  const label = count > 99 ? '99+' : String(count);
  const wide = label.length > 1;
  return (
    <View style={[styles.badge, wide ? styles.badgeWide : null]}>
      <RNText style={styles.badgeText} allowFontScaling={false}>
        {label}
      </RNText>
    </View>
  );
}

const ICON_SIZE = 22;

export function MessagesNotificationsHeaderIcons({
  messagesRoute = 'MessagesFlow',
  notificationsRoute = 'NotificationsFlow',
  iconColor = '#fff',
  onSettingsPress,
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
        <Ionicons name="chatbubbles-outline" size={ICON_SIZE} color={iconColor} />
        {messageCount > 0 ? <UnreadBadge count={messageCount} /> : null}
      </Pressable>
      <Pressable
        onPress={() => openFlow(notificationsRoute)}
        style={styles.hit}
        accessibilityLabel="Notifications"
        accessibilityHint="Open notifications"
      >
        <Ionicons name="notifications-outline" size={ICON_SIZE} color={iconColor} />
        {notificationCount > 0 ? <UnreadBadge count={notificationCount} /> : null}
      </Pressable>
      {onSettingsPress ? (
        <Pressable
          onPress={onSettingsPress}
          style={styles.hit}
          accessibilityLabel="Settings"
          accessibilityHint="Open profile settings"
        >
          <Ionicons name="settings-outline" size={ICON_SIZE} color={iconColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const BADGE_SIZE = 16;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hit: {
    padding: 6,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeWide: {
    width: undefined,
    minWidth: BADGE_SIZE,
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#1A1A1A',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
