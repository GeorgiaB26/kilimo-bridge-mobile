import React from 'react';
import { Chip } from 'react-native-paper';
import { COLORS } from '../../constants';

type Variant = 'success' | 'pending' | 'info' | 'warning';

const VARIANT_STYLES: Record<Variant, { bg: string; text: string }> = {
  success: { bg: '#E8F5E9', text: COLORS.success },
  pending: { bg: '#FFF8E1', text: COLORS.warning },
  info: { bg: '#E3F2FD', text: COLORS.info },
  warning: { bg: '#FFF3E0', text: COLORS.warning },
};

export function KBStatusChip({ label, variant = 'info' }: { label: string; variant?: Variant }) {
  const v = VARIANT_STYLES[variant];
  return (
    <Chip
      compact
      style={{ backgroundColor: v.bg }}
      textStyle={{ color: v.text, fontSize: 12, fontWeight: '700' }}
    >
      {label}
    </Chip>
  );
}
