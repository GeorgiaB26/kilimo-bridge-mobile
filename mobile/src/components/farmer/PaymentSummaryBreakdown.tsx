import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';

type Summary = {
  transferred: number;
  pending: number;
  expected: number;
  total: number;
  completed?: number;
  allPayments?: number;
};

type Props = {
  summary: Summary;
  formatAmount: (n: number) => string;
};

function BreakdownRow({
  label,
  amount,
  dotColor,
  formatAmount,
}: {
  label: string;
  amount: number;
  dotColor: string;
  formatAmount: (n: number) => string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowAmount}>{formatAmount(amount)}</Text>
      </View>
    </View>
  );
}

export function PaymentSummaryBreakdown({ summary, formatAmount }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.totalLabel}>Total earnings</Text>
      <Text style={styles.totalAmount}>{formatAmount(summary.total)}</Text>
      <BreakdownRow
        label="Completed"
        amount={summary.completed ?? summary.transferred}
        dotColor="#70AD47"
        formatAmount={formatAmount}
      />
      <BreakdownRow
        label="Pending payment"
        amount={summary.pending}
        dotColor="#FFC000"
        formatAmount={formatAmount}
      />
      <BreakdownRow
        label="Expected (assigned tasks)"
        amount={summary.expected}
        dotColor="#4472C4"
        formatAmount={formatAmount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#1A4D3E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  totalAmount: { color: '#D4AF6A', fontSize: 36, fontWeight: '800', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  rowBody: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#fff', fontSize: 14 },
  rowAmount: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
