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

function UnreadBadge({ count, compact }: { count: number; compact: boolean }) {
  const label = count > 99 ? '99+' : String(count);
  const wide = label.length > 1;
  const badgeSize = compact ? BADGE_SIZE_COMPACT : BADGE_SIZE;
  return (
    <View
      style={[
        styles.badge,
        compact ? styles.badgeCompact : styles.badgeDefault,
        {
          width: wide ? undefined : badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          minWidth: wide ? badgeSize : undefined,
          paddingHorizontal: wide ? (compact ? 2 : 3) : 0,
        },
      ]}
    >
      <RNText
        style={[
          styles.badgeText,
          compact ? styles.badgeTextCompact : styles.badgeTextDefault,
        ]}
        allowFontScaling={false}
      >
        {label}
      </RNText>
    </View>
  );
}

/** Nav header icon sizes (25% smaller than the previous 22 / 20 defaults). */
export const NAV_HEADER_ICON_SIZE = 17;
export const NAV_HEADER_ICON_SIZE_COMPACT = 15;

const ICON_SIZE_DEFAULT = NAV_HEADER_ICON_SIZE;
const ICON_SIZE_COMPACT = NAV_HEADER_ICON_SIZE_COMPACT;
const HIT_PADDING_DEFAULT = 5;
const HIT_PADDING_COMPACT = 3;

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
        {displayMessageCount > 0 ? <UnreadBadge count={displayMessageCount} compact={compact} /> : null}
      </Pressable>
      <Pressable
        onPress={() => openFlow(notificationsRoute)}
        style={[styles.hit, { padding: hitPadding }]}
        accessibilityLabel="Notifications"
        accessibilityHint="Open notifications"
      >
        <Ionicons name="notifications-outline" size={iconSize} color={iconColor} />
        {notificationCount > 0 ? <UnreadBadge count={notificationCount} compact={compact} /> : null}
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

/** Sized to match NAV_HEADER_ICON_SIZE* (was 16px when icons were 22/20). */
const BADGE_SIZE = 13;
const BADGE_SIZE_COMPACT = 11;

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
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeDefault: {
    top: 0,
    right: 0,
  },
  badgeCompact: {
    top: -1,
    right: -1,
  },
  badgeText: {
    color: '#1A1A1A',
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  badgeTextDefault: {
    fontSize: 7,
    lineHeight: 9,
  },
  badgeTextCompact: {
    fontSize: 6,
    lineHeight: 8,
  },
});
