import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatFarmerStatus } from '../../utils/farmerStatus';

export function FarmerStatusChip({
  status,
  compact = false,
}: {
  status?: string | null;
  /** Smaller pill for dense lists (e.g. dashboard recent farmers). */
  compact?: boolean;
}) {
  const info = formatFarmerStatus(status);
  const Icon = info.Icon;
  return (
    <View
      style={[
        styles.chip,
        compact ? styles.chipCompact : null,
        { backgroundColor: info.color },
      ]}
    >
      <Icon size={compact ? 11 : 14} color={info.textColor} />
      <Text
        style={[
          styles.text,
          compact ? styles.textCompact : null,
          { color: info.textColor },
        ]}
      >
        {info.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  textCompact: {
    fontSize: 11,
    fontWeight: '600',
  },
});
