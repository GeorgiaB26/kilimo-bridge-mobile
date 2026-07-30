import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { api } from '../../api/client';
import { RoleHeroHeader } from '../../components/RoleHeroHeader';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { showMessage } from '../../utils/feedback';
import { useCurrency } from '../../context/CurrencyContext';

type PaymentRow = {
  id: string;
  farmer_name: string;
  amount: number;
  payment_status: string;
  phone_number?: string;
  project_name?: string;
};

export function BankingPaymentsScreen() {
  const { formatAmount, formatPayment } = useCurrency();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/banking/payments');
      setPayments(
        (data.payments ?? []).filter((p: PaymentRow) => p.payment_status === 'Pending')
      );
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const processPayment = async (paymentId: string) => {
    setProcessing(paymentId);
    try {
      const { data } = await api.post(`/banking/payments/${paymentId}/process`);
      showMessage('Payment processed', `Reference: ${data.reference ?? 'Pending'}`);
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    } catch {
      showMessage('Failed', 'Payment could not be processed. Try again.');
    } finally {
      setProcessing(null);
    }
  };

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
      data={payments}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={COLORS.primary}
        />
      }
      ListHeaderComponent={
        <RoleHeroHeader
          title="Payment queue"
          subtitle="Process M-Pesa payouts to farmers"
          icon="send"
          accent={COLORS.accent}
        >
          <Text style={styles.queueCount}>{payments.length} pending</Text>
        </RoleHeroHeader>
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const busy = processing === item.id;
        const done = processing !== null && !busy && processing !== item.id;
        return (
          <KBCard>
            <View style={styles.cardTop}>
              <View>
                <Text style={styles.name}>{item.farmer_name}</Text>
                <Text style={styles.meta}>{item.phone_number ?? '—'}</Text>
                {item.project_name ? <Text style={styles.project}>{item.project_name}</Text> : null}
              </View>
              <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
            </View>
            <KBStatusChip label="Pending" variant="pending" />
            <Button
              mode="contained"
              onPress={() => processPayment(item.id)}
              loading={busy}
              disabled={busy || done}
              buttonColor={busy ? COLORS.muted : COLORS.primary}
              style={styles.processBtn}
              icon="cash"
            >
              {busy ? 'Processing…' : `Process ${formatPayment(item.amount)}`}
            </Button>
          </KBCard>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-circle" size={48} color={COLORS.success} />
          <Text style={styles.empty}>Queue empty — all payments processed</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  queueCount: { color: COLORS.accent, fontSize: 15, fontWeight: '700', marginTop: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  project: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  processBtn: { marginTop: 12, borderRadius: 10 },
  emptyWrap: { alignItems: 'center', marginTop: 48, gap: 12 },
  empty: { color: COLORS.muted, fontSize: 15 },
});
