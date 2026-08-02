import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatFarmerStatus } from '../../utils/farmerStatus';

export function FarmerStatusChip({ status }: { status?: string | null }) {
  const info = formatFarmerStatus(status);
  return (
    <View style={[styles.chip, { backgroundColor: info.color }]}>
      <Text style={[styles.text, { color: info.textColor }]}>
        {info.icon} {info.label}
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
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
