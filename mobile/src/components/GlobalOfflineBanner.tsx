import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { useConnectivityOnline } from '../hooks/useConnectivityOnline';
import { useAuthStore } from '../store/authStore';

const OFFLINE_BANNER_BG = '#E8F5F0';
const OFFLINE_BANNER_BORDER = '#C8E6C9';

const OFFLINE_MESSAGE_AUTHENTICATED =
  "You're offline — you can continue working. Your changes will sync when you're back online.";

const OFFLINE_MESSAGE_UNAUTHENTICATED =
  "You're offline — connect to the internet to sign in.";

/** App-wide offline strip — mounted once at the navigation root. */
export function GlobalOfflineBanner() {
  const online = useConnectivityOnline();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const insets = useSafeAreaInsets();

  if (online !== false) return null;

  const message = isAuthenticated
    ? OFFLINE_MESSAGE_AUTHENTICATED
    : OFFLINE_MESSAGE_UNAUTHENTICATED;

  return (
    <View
      style={[styles.banner, { paddingTop: Math.max(insets.top, 8) }]}
      accessibilityRole="text"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={18} color={COLORS.primary} style={styles.icon} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OFFLINE_BANNER_BG,
    borderBottomWidth: 1,
    borderBottomColor: OFFLINE_BANNER_BORDER,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  icon: {
    marginRight: 10,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.text,
    fontWeight: '500',
  },
});
