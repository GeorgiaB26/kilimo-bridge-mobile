import React, { useState, useEffect } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
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
      className="flex-1 p-4"
      data={payments}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">Banking Dashboard</Text>
          <Text className="mb-4 text-sm text-[#757575]">Payment transactions & M-Pesa processing</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-2 rounded-lg bg-[#F9F9F9] p-3.5">
          <Text className="text-base font-semibold text-[#333333]">{item.farmer_name}</Text>
          <Text className="mt-1 text-lg font-bold text-[#D4AF6A]">{formatAmount(item.amount)}</Text>
          <Text className="mt-0.5 text-[13px] text-[#757575]">
            {item.project_name} · {item.phone_number}
          </Text>
          <Text
            className={cn(
              'mt-1.5 text-xs font-semibold',
              item.payment_status === 'Transferred' ? 'text-[#2E7D5E]' : 'text-[#D4AF6A]'
            )}
          >
            {item.payment_status}
          </Text>
        </View>
      )}
    />
  );
}
