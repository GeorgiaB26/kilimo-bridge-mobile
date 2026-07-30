import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { api } from '../../api/client';
import { RoleHeroHeader } from '../../components/RoleHeroHeader';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';

export function BankingDashboardScreen() {
  const { formatAmount } = useCurrency();
  const [payments, setPayments] = useState<Array<{
    id: string;
    farmer_name: string;
    amount: number;
    payment_status: string;
    phone_number: string;
    project_name: string;
    created_at?: string;
  }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/banking/payments');
      setPayments(data.payments ?? []);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = payments.filter((p) => p.payment_status === 'Pending').length;
  const completed = payments.filter((p) => p.payment_status === 'Transferred').length;
  const totalPaid = payments
    .filter((p) => p.payment_status === 'Transferred')
    .reduce((s, p) => s + p.amount, 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={payments.slice(0, 30)}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={COLORS.primary}
        />
      }
      ListHeaderComponent={
        <View>
          <RoleHeroHeader
            title="Banking"
            subtitle="M-Pesa transaction log"
            icon="card"
          />
          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Ionicons name="time" size={22} color={COLORS.warning} />
              <Text style={styles.statN}>{pending}</Text>
              <Text style={styles.statL}>Pending</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
              <Text style={styles.statN}>{completed}</Text>
              <Text style={styles.statL}>Completed</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cash" size={22} color={COLORS.accent} />
              <Text style={styles.statN}>{formatAmount(totalPaid)}</Text>
              <Text style={styles.statL}>Total paid</Text>
            </View>
          </View>
          <Text style={styles.section}>Recent activity</Text>
        </View>
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <KBCard>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.farmer_name}</Text>
              <Text style={styles.detail}>{item.project_name} · {item.phone_number}</Text>
              {item.created_at ? <Text style={styles.date}>{item.created_at.slice(0, 10)}</Text> : null}
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
              <KBStatusChip
                label={item.payment_status}
                variant={item.payment_status === 'Transferred' ? 'success' : 'pending'}
              />
            </View>
          </View>
        </KBCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statN: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  statL: { fontSize: 11, color: COLORS.muted },
  section: { fontSize: 18, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  amount: { fontSize: 17, fontWeight: '700', color: COLORS.accent },
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  date: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
