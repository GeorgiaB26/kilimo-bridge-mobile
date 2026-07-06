import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { getFarmerPayments } from '../../api/client';

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
        <View style={styles.header}>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.total}>{total.toLocaleString()} KES</Text>
          <Text style={styles.subtitle}>Lifetime earnings</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{item.project_name}</Text>
            <Text style={styles.amount}>{item.amount?.toLocaleString()} KES</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.date}>{item.created_at?.slice(0, 10)}</Text>
            <Text style={[styles.badge, item.payment_status === 'Transferred' ? styles.transferred : styles.pending]}>
              {item.payment_status}
            </Text>
          </View>
          {item.mpesa_reference ? (
            <Text style={styles.ref}>Ref: {item.mpesa_reference}</Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 18, color: COLORS.muted },
  total: { fontSize: 36, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  subtitle: { fontSize: 14, color: COLORS.muted },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  amount: { fontSize: 15, fontWeight: '600', color: COLORS.accent },
  date: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  badge: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  transferred: { color: COLORS.success },
  pending: { color: COLORS.accent },
  ref: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
});
