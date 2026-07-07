import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { COLORS } from '../../constants';

interface KBProgressBarProps {
  progress: number;
  label?: string;
}

export function KBProgressBar({ progress, label }: KBProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={styles.wrap}>
      <ProgressBar progress={pct / 100} color={COLORS.success} style={styles.bar} />
      <Text style={styles.text}>{label ?? `${pct}% complete`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  bar: { height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  text: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
});
