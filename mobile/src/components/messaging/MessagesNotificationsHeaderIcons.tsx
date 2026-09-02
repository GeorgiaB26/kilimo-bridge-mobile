import React from 'react';
import { Pressable, View, StyleSheet, Text as RNText } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useUnreadInboxCounts } from '../../hooks/useUnreadInboxCounts';

type Props = {
  messagesRoute?: string;
  notificationsRoute?: string;
  iconColor?: string;
  /** Tighter icon sizing for the compact farmer nav header. */
  compact?: boolean;
  /** Optional settings gear (same size/spacing as messages & notifications). */
  onSettingsPress?: () => void;
  /** Override default navigate-to-MessagesFlow (e.g. Support switches to Messages tab). */
  onMessagesPress?: () => void;
  /** When set, replaces the generic unread-message badge (e.g. support unread_open). */
  messageCountOverride?: number;
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

const ICON_SIZE_DEFAULT = 22;
const ICON_SIZE_COMPACT = 20;
const HIT_PADDING_DEFAULT = 6;
const HIT_PADDING_COMPACT = 4;

export function MessagesNotificationsHeaderIcons({
  messagesRoute = 'MessagesFlow',
  notificationsRoute = 'NotificationsFlow',
  iconColor = '#fff',
  compact = false,
  onSettingsPress,
  onMessagesPress,
  messageCountOverride,
}: Props) {
  const navigation = useNavigation();
  const { messageCount, notificationCount } = useUnreadInboxCounts();
  const displayMessageCount =
    typeof messageCountOverride === 'number' ? messageCountOverride : messageCount;
  const iconSize = compact ? ICON_SIZE_COMPACT : ICON_SIZE_DEFAULT;
  const hitPadding = compact ? HIT_PADDING_COMPACT : HIT_PADDING_DEFAULT;

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
        onPress={() => {
          if (onMessagesPress) {
            onMessagesPress();
            return;
          }
          openFlow(messagesRoute);
        }}
        style={[styles.hit, { padding: hitPadding }]}
        accessibilityLabel="Messages"
        accessibilityHint="Open messages"
      >
        <Ionicons name="chatbubbles-outline" size={iconSize} color={iconColor} />
        {displayMessageCount > 0 ? <UnreadBadge count={displayMessageCount} /> : null}
      </Pressable>
      <Pressable
        onPress={() => openFlow(notificationsRoute)}
        style={[styles.hit, { padding: hitPadding }]}
        accessibilityLabel="Notifications"
        accessibilityHint="Open notifications"
      >
        <Ionicons name="notifications-outline" size={iconSize} color={iconColor} />
        {notificationCount > 0 ? <UnreadBadge count={notificationCount} /> : null}
      </Pressable>
      {onSettingsPress ? (
        <Pressable
          onPress={onSettingsPress}
          style={[styles.hit, { padding: hitPadding }]}
          accessibilityLabel="Settings"
          accessibilityHint="Open profile settings"
        >
          <Ionicons name="settings-outline" size={iconSize} color={iconColor} />
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
    gap: 6,
  },
  hit: {
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
