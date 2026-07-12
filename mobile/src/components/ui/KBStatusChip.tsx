import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';

type Variant = 'success' | 'pending' | 'info' | 'warning';

const VARIANT_STYLES: Record<Variant, { bg: string; text: string }> = {
  success: { bg: '#E8F5E9', text: COLORS.success },
  pending: { bg: '#FFF8E1', text: COLORS.warning },
  info: { bg: '#E3F2FD', text: COLORS.info },
  warning: { bg: '#FFF3E0', text: COLORS.warning },
};

export function KBStatusChip({ label, variant = 'info' }: { label: string; variant?: Variant }) {
  const safeVariant = variant && VARIANT_STYLES[variant] ? variant : 'info';
  const v = VARIANT_STYLES[safeVariant];
  const text = label?.trim() || 'Unknown';

  return (
    <View style={[styles.chip, { backgroundColor: v.bg }]}>
      <Text style={[styles.text, { color: v.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
