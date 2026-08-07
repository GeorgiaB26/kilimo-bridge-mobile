import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { formatOfflineCacheTime, offlineCacheBannerText } from '../services/offlineReadCache';

interface Props {
  fetchedAt: string;
}

/** Shown when UI is rendering last-cached API data after a live fetch failed. */
export function OfflineCachedDataBanner({ fetchedAt }: Props) {
  return (
    <View style={styles.card} accessibilityRole="text" accessibilityLabel={offlineCacheBannerText(fetchedAt)}>
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={18} color={COLORS.warning} />
        <Text style={styles.title}>Showing offline data</Text>
      </View>
      <Text style={styles.message}>
        from {formatOfflineCacheTime(fetchedAt)}. Connect to refresh with live data.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.warning },
  message: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
});
