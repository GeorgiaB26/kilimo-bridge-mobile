import React from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../constants';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';

/** Fixed green top nav — shared by farmer and field-agent main tabs/stacks. */
export const APP_NAV_HEADER_HEIGHT = 46;

type Props = {
  title: string;
  onBack?: () => void;
  showInboxIcons?: boolean;
  rightAccessory?: React.ReactNode;
  /** Defaults to primary green; Support desk passes blue. */
  backgroundColor?: string;
};

export function AppNavHeader({
  title,
  onBack,
  showInboxIcons = true,
  rightAccessory,
  backgroundColor = COLORS.primary,
}: Props) {
  const hasRight = showInboxIcons || Boolean(rightAccessory);

  return (
    <View style={[styles.bar, { backgroundColor }]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {hasRight ? (
        <View style={styles.right}>
          {showInboxIcons ? <MessagesNotificationsHeaderIcons iconColor="#fff" compact /> : null}
          {rightAccessory}
        </View>
      ) : (
        <View style={styles.rightSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: APP_NAV_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 12,
    ...(Platform.OS === 'web' ? ({ flexShrink: 0 } as object) : null),
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  backBtn: {
    marginRight: 2,
    marginLeft: -4,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'left',
  },
  rightSpacer: {
    width: 1,
  },
});

/** @deprecated Use APP_NAV_HEADER_HEIGHT */
export const FARMER_NAV_HEADER_HEIGHT = APP_NAV_HEADER_HEIGHT;

/** @deprecated Use AppNavHeader */
export const FarmerNavHeader = AppNavHeader;
