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
      <View style={styles.barTrack}>
        <ProgressBar progress={pct / 100} color={COLORS.success} style={styles.bar} />
      </View>
      {stacked ? (
        <View style={styles.stackedLabels}>
          <Text style={styles.primaryLine}>{left}</Text>
          {rightLabel ? <Text style={styles.secondaryLine}>{rightLabel}</Text> : null}
        </View>
      ) : (
        <View style={styles.labelRow}>
          <Text style={styles.primaryLine}>{left}</Text>
          {rightLabel ? (
            <Text style={[styles.secondaryLine, styles.inlineRight]} numberOfLines={1}>
              {rightLabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    marginBottom: 4,
    width: '100%',
  },
  barTrack: {
    height: 8,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 12,
    gap: 12,
    width: '100%',
  },
  stackedLabels: {
    marginTop: 12,
    width: '100%',
  },
  primaryLine: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 4,
  },
  secondaryLine: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.muted,
    fontWeight: '500',
  },
  inlineRight: {
    flexShrink: 1,
    textAlign: 'right',
    marginBottom: 0,
  },
});
