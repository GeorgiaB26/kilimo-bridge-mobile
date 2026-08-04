import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatFarmerStatus } from '../../utils/farmerStatus';

export function FarmerStatusChip({ status }: { status?: string | null }) {
  const info = formatFarmerStatus(status);
  const Icon = info.Icon;
  return (
    <View style={[styles.chip, { backgroundColor: info.color }]}>
      <Icon size={14} color={info.textColor} />
      <Text style={[styles.text, { color: info.textColor }]}>{info.label}</Text>
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
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
