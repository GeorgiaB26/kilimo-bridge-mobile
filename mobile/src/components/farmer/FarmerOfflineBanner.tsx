import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, API_BASE_URL } from '../../constants';

interface Props {
  message: string;
  hint?: string;
}

export function FarmerOfflineBanner({ message, hint }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Could not load your data</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.api}>API: {API_BASE_URL}</Text>
      <Text style={styles.hint}>
        {hint ?? 'Use quick login: Farmer +254712345678. Restart backend: cd backend && npm run dev'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.alert, marginBottom: 6 },
  message: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  api: { fontSize: 11, color: COLORS.muted, marginTop: 8 },
  hint: { fontSize: 13, color: COLORS.muted, marginTop: 10, lineHeight: 18 },
});
