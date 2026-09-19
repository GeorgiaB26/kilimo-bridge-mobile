import React, { type ComponentType } from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import { Text } from '@/components/ui/text';

const KPI_ICON_SIZE = 10;

type Props = {
  label: string;
  value: number;
  Icon: ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  countColor?: string;
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
};

export function KpiMetricCard({
  label,
  value,
  Icon,
  iconColor = '#757575',
  countColor = '#333333',
  onPress,
  selected = false,
  accessibilityLabel,
}: Props) {
  const content = (
    <View style={[styles.card, selected ? styles.cardSelected : null]}>
      <View style={styles.metricRow}>
        <Icon size={KPI_ICON_SIZE} color={iconColor} />
        <Text className="text-2xl font-bold" style={[styles.count, { color: countColor }]}>
          {value}
        </Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : undefined}
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      style={[
        styles.pressable,
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    alignItems: 'stretch',
  },
  cardSelected: {
    borderColor: '#1A4D3E',
    borderWidth: 2,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  count: {
    flexShrink: 1,
    lineHeight: 28,
  },
  label: {
    marginTop: 4,
    width: '100%',
    fontSize: 12,
    lineHeight: 16,
    color: '#757575',
    ...Platform.select({
      android: { textBreakStrategy: 'simple' as const },
      ios: { lineBreakStrategyIOS: 'standard' as const },
      default: {},
    }),
  },
});
