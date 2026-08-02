import React, { useState } from 'react';
import { View, FlatList, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api, verifyFarmerId } from '../../api/client';
import { useCurrency } from '../../context/CurrencyContext';

export function BankingPaymentsScreen() {
  const { formatAmount, formatPayment } = useCurrency();
  const [payments, setPayments] = useState<Array<{ id: string; farmer_name: string; amount: number; payment_status: string }>>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [idNumber, setIdNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; name?: string; farmer_id?: string } | null>(null);

  React.useEffect(() => {
    api.get('/banking/payments').then((r) => setPayments(
      (r.data.payments ?? []).filter((p: { payment_status: string }) => p.payment_status === 'Pending')
    )).catch(() => {});
  }, []);

  const runVerify = async () => {
    if (!idNumber.trim()) {
      Alert.alert('Missing ID', 'Enter the farmer national ID number to verify.');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyFarmerId(idNumber.trim());
      setVerifyResult(result);
      if (!result.verified) {
        Alert.alert('Not verified', 'ID does not match any registered farmer.');
      }
    } catch {
      Alert.alert('Error', 'Could not verify farmer ID');
    } finally {
      setVerifying(false);
    }
  };

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
        <View>
          <Text className="mb-4 text-[22px] font-bold text-[#1A4D3E]">Process M-Pesa Payments</Text>
          <View className="mb-4 rounded-lg bg-[#F9F9F9] p-3.5">
            <Text className="mb-2 text-base font-semibold text-[#333333]">Verify farmer ID</Text>
            <TextInput
              className="mb-2 rounded-lg border border-[#E0E0E0] bg-white p-2.5"
              placeholder="National ID number"
              value={idNumber}
              onChangeText={setIdNumber}
              autoCapitalize="none"
            />
            <Button className="h-10 bg-[#1A4D3E]" disabled={verifying} onPress={runVerify}>
              {verifying ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Verify ID</Text>}
            </Button>
            {verifyResult?.verified ? (
              <Text className="mt-2 text-sm text-[#2E7D5E]">
                Verified: {verifyResult.name} ({verifyResult.farmer_id})
              </Text>
            ) : null}
          </View>
        </View>
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
