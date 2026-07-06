import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants';
import { api } from '../../api/client';

export function BankingPaymentsScreen() {
  const [payments, setPayments] = useState<Array<{ id: string; farmer_name: string; amount: number; payment_status: string }>>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  React.useEffect(() => {
    api.get('/banking/payments').then((r) => setPayments(
      (r.data.payments ?? []).filter((p: { payment_status: string }) => p.payment_status === 'Pending')
    )).catch(() => {});
  }, []);

  const processPayment = async (paymentId: string) => {
    setProcessing(paymentId);
    try {
      const { data } = await api.post(`/banking/payments/${paymentId}/process`);
      Alert.alert('Payment Processed', `Reference: ${data.reference ?? 'Pending'}`);
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    } catch {
      Alert.alert('Error', 'Payment processing failed');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <FlatList
      style={styles.container}
      data={payments}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.title}>Process M-Pesa Payments</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.farmer_name}</Text>
          <Text style={styles.amount}>{item.amount?.toLocaleString()} KES</Text>
          <Button
            title="Process via Equity H2H"
            onPress={() => processPayment(item.id)}
            loading={processing === item.id}
            style={styles.btn}
          />
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No pending payments</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '600' },
  amount: { fontSize: 18, color: COLORS.accent, fontWeight: '700', marginVertical: 8 },
  btn: { marginTop: 4 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 32 },
});
