import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { COLORS } from '../../constants';

interface KBProgressBarProps {
  progress: number;
  label?: string;
  rightLabel?: string;
  /** Stack labels vertically — better on narrow cards */
  stacked?: boolean;
}

export function KBProgressBar({ progress, label, rightLabel, stacked = false }: KBProgressBarProps) {
  const pct = Math.min(100, Math.max(0, progress));
  const left = label ?? `${pct}% done`;
  return (
    <View style={styles.wrap}>
      <ProgressBar progress={pct / 100} color={COLORS.success} style={styles.bar} />
      {stacked ? (
        <View style={styles.stackedLabels}>
          <Text style={styles.text}>{left}</Text>
          {rightLabel ? <Text style={styles.subText}>{rightLabel}</Text> : null}
        </View>
      ) : (
        <View style={styles.labelRow}>
          <Text style={styles.text}>{left}</Text>
          {rightLabel ? <Text style={styles.rightText} numberOfLines={1}>{rightLabel}</Text> : null}
        </View>
      )}
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
    marginTop: 10,
    gap: 12,
    minHeight: 20,
    paddingBottom: 4,
  },
  stackedLabels: { marginTop: 10, gap: 6, paddingBottom: 6 },
  text: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  subText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  rightText: { fontSize: 13, color: COLORS.muted, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
});
