import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { COLORS } from '../../constants';

interface KBProgressBarProps {
  progress: number;
  label?: string;
  rightLabel?: string;
}

export function KBProgressBar({ progress, label, rightLabel }: KBProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress));
  return (
    <View style={styles.wrap}>
      <ProgressBar progress={pct / 100} color={COLORS.success} style={styles.bar} />
      <View style={styles.labelRow}>
        <Text style={styles.text}>{label ?? `${pct}% done`}</Text>
        {rightLabel ? <Text style={styles.rightText}>{rightLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  text: { fontSize: 13, color: COLORS.text, fontWeight: '600', flexShrink: 0 },
  rightText: { fontSize: 13, color: COLORS.muted, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
