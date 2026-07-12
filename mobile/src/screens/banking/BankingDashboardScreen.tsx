import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { COLORS } from '../../constants';
import { api } from '../../api/client';

import { useCurrency } from '../../context/CurrencyContext';

export function BankingDashboardScreen() {
  const { formatAmount } = useCurrency();
  const [payments, setPayments] = useState<Array<{
    id: string; farmer_name: string; amount: number;
    payment_status: string; phone_number: string; project_name: string;
  }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/banking/payments');
      setPayments(data.payments ?? []);
    } catch { /* */ }
  };

  useEffect(() => { load(); }, []);

  return (
    <FlatList
      style={styles.container}
      data={payments}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Banking Dashboard</Text>
          <Text style={styles.subtitle}>Payment transactions & M-Pesa processing</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.farmer_name}</Text>
          <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
          <Text style={styles.detail}>{item.project_name} · {item.phone_number}</Text>
          <Text style={[styles.badge, item.payment_status === 'Transferred' ? styles.done : styles.pending]}>
            {item.payment_status}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  amount: { fontSize: 18, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  done: { color: COLORS.success },
  pending: { color: COLORS.accent },
});
