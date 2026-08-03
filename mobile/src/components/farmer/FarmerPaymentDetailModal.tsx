import React from 'react';
import { View, Modal, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { formatDueDate } from '../../utils/greeting';

export type FarmerPaymentRow = {
  id: string;
  project_name: string;
  amount: number;
  payment_status: string;
  payment_method: string;
  created_at: string;
  mpesa_reference?: string;
  description?: string;
};

function statusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'transferred' || lower === 'paid') return '#70AD47';
  if (lower === 'pending' || lower === 'processing') return '#FFC000';
  return '#999999';
}

type Props = {
  payment: FarmerPaymentRow | null;
  onClose: () => void;
  formatAmount: (n: number) => string;
};

export function FarmerPaymentDetailModal({ payment, onClose, formatAmount }: Props) {
  if (!payment) return null;

  const color = statusColor(payment.payment_status);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Project / task</Text>
          <Text style={styles.value}>{payment.project_name}</Text>
          {payment.description && payment.description !== payment.project_name ? (
            <Text style={styles.subValue}>{payment.description}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>Payment</Text>
          <Text style={styles.amount}>{formatAmount(payment.amount)}</Text>
          <Text style={styles.label}>Status</Text>
          <Text style={[styles.value, { color }]}>{payment.payment_status}</Text>
          <Text style={styles.label}>Method</Text>
          <Text style={styles.value}>{payment.payment_method}</Text>
          {payment.mpesa_reference ? (
            <>
              <Text style={styles.label}>M-Pesa reference</Text>
              <Text style={styles.reference}>{payment.mpesa_reference}</Text>
            </>
          ) : null}
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatDueDate(payment.created_at)}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6', padding: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#1A4D3E', fontWeight: '600', fontSize: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e8ecea',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A4D3E',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  label: { fontSize: 12, color: '#757575', marginTop: 10 },
  value: { fontSize: 16, color: '#333', fontWeight: '600' },
  subValue: { fontSize: 14, color: '#757575', marginTop: 4 },
  amount: { fontSize: 32, fontWeight: '800', color: '#D4AF6A', marginVertical: 4 },
  reference: { fontSize: 15, fontFamily: 'monospace', color: '#333' },
});
