import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { getFarmerPayments } from '../../api/client';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

export function FarmerPaymentsScreen() {
  const [payments, setPayments] = useState<Array<{
    project_name: string;
    amount: number;
    payment_status: string;
    payment_method: string;
    created_at: string;
    mpesa_reference?: string;
  }>>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    getFarmerPayments().then((d) => {
      setPayments(d.payments ?? []);
      const earned = (d.payments ?? [])
        .filter((p: { payment_status: string }) => p.payment_status === 'Transferred')
        .reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      setTotal(earned);
    }).catch(() => {});
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={payments}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <Surface style={styles.summary} elevation={2}>
          <Text style={styles.summaryLabel}>Total Earned</Text>
          <Text style={styles.summaryAmount}>{total.toLocaleString()} KES</Text>
          <Text style={styles.summarySub}>Lifetime earnings via M-Pesa</Text>
        </Surface>
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <KBCard>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={item.payment_method === 'M-Pesa' ? 'phone-portrait' : 'card'}
                size={20}
                color={COLORS.primary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.project_name}</Text>
              <Text style={styles.date}>{item.created_at?.slice(0, 10)}</Text>
            </View>
            <Text style={styles.amount}>{item.amount?.toLocaleString()}</Text>
          </View>
          <View style={styles.badgeRow}>
            <KBStatusChip
              label={item.payment_status}
              variant={item.payment_status === 'Transferred' ? 'success' : 'pending'}
            />
            {item.mpesa_reference ? (
              <Text style={styles.ref}>Ref: {item.mpesa_reference}</Text>
            ) : null}
          </View>
        </KBCard>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No payments yet</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  list: { padding: 16, paddingBottom: 32 },
  summary: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: COLORS.primary,
  },
  summaryLabel: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  summaryAmount: { fontSize: 40, fontWeight: '800', color: COLORS.accent, marginVertical: 8 },
  summarySub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  date: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '700', color: COLORS.accent },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  ref: { fontSize: 11, color: COLORS.muted },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
