import React, { useState, useEffect } from 'react';
import { View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { getFarmerPayments } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

import { useCurrency } from '../../context/CurrencyContext';

export function FarmerPaymentsScreen() {
  const { formatAmount } = useCurrency();
  const [payments, setPayments] = useState<Array<{
    project_name: string;
    amount: number;
    payment_status: string;
    payment_method: string;
    created_at: string;
    mpesa_reference?: string;
  }>>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFarmerPayments().then((d) => {
      setPayments(d.payments ?? []);
      const earned = (d.payments ?? [])
        .filter((p: { payment_status: string }) => p.payment_status === 'Transferred')
        .reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      setTotal(earned);
      setError(null);
    }).catch((err: unknown) => {
      setError(extractApiError(err, 'Could not load payments'));
    });
  }, []);

  return (
    <FlatList
      className="flex-1 bg-[#F5F5F5]"
      data={payments}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <>
          {error ? <FarmerOfflineBanner message={error} /> : null}
          <View className="mb-5 items-center rounded-2xl bg-[#1A4D3E] p-7">
            <Text className="text-sm text-white/85">Total Earned</Text>
            <Text className="my-2 text-[40px] font-extrabold text-[#D4AF6A]">{formatAmount(total)}</Text>
            <Text className="text-[13px] text-white/70">Lifetime earnings via M-Pesa</Text>
          </View>
        </>
      }
      contentContainerClassName="p-4 pb-8"
      renderItem={({ item }) => (
        <KBCard>
          <View className="flex-row items-center">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F5]">
              <Ionicons
                name={item.payment_method === 'M-Pesa' ? 'phone-portrait' : 'card'}
                size={20}
                color="#1A4D3E"
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-[#333333]">{item.project_name}</Text>
              <Text className="mt-0.5 text-xs text-[#757575]">{item.created_at?.slice(0, 10)}</Text>
            </View>
            <Text className="text-lg font-bold text-[#D4AF6A]">{formatAmount(item.amount)}</Text>
          </View>
          <View className="mt-3 flex-row items-center justify-between">
            <KBStatusChip
              label={item.payment_status}
              variant={item.payment_status === 'Transferred' ? 'success' : 'pending'}
            />
            {item.mpesa_reference ? (
              <Text className="text-[11px] text-[#757575]">Ref: {item.mpesa_reference}</Text>
            ) : null}
          </View>
        </KBCard>
      )}
      ListEmptyComponent={<Text className="mt-10 text-center text-[#757575]">No payments yet</Text>}
    />
  );
}
