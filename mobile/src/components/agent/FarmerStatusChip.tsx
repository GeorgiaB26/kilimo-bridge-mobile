import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatFarmerStatus } from '../../utils/farmerStatus';

export function FarmerStatusChip({
  status,
  compact = false,
  centered = false,
}: {
  status?: string | null;
  /** Smaller pill for dense lists (e.g. dashboard recent farmers). */
  compact?: boolean;
  /** Center the chip in a column (e.g. farmer profile / home header cards). */
  centered?: boolean;
}) {
  const info = formatFarmerStatus(status);
  const Icon = info.Icon;
  return (
    <View
      style={[
        styles.chip,
        compact ? styles.chipCompact : null,
        centered ? styles.chipCentered : null,
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
  chipCentered: {
    alignSelf: 'center',
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
