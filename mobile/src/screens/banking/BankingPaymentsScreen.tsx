import React, { useState } from 'react';
import { View, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';
import { useCurrency } from '../../context/CurrencyContext';

export function BankingPaymentsScreen() {
  const { formatAmount, formatPayment } = useCurrency();
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
      className="flex-1 p-4"
      data={payments}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Text className="mb-4 text-[22px] font-bold text-[#1A4D3E]">Process M-Pesa Payments</Text>
      }
      renderItem={({ item }) => (
        <View className="mb-2.5 rounded-lg bg-[#F9F9F9] p-3.5">
          <Text className="text-base font-semibold text-[#333333]">{item.farmer_name}</Text>
          <Text className="my-2 text-lg font-bold text-[#D4AF6A]">{formatAmount(item.amount)}</Text>
          <Button
            className="mt-1 h-12 bg-[#1A4D3E]"
            disabled={processing === item.id}
            onPress={() => processPayment(item.id)}
          >
            {processing === item.id ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white">Process {formatPayment(item.amount)}</Text>
            )}
          </Button>
        </View>
      )}
      ListEmptyComponent={
        <Text className="mt-8 text-center text-[#757575]">No pending payments</Text>
      }
    />
  );
}
