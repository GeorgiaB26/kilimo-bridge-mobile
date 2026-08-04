import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { getFarmerPayments } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { FarmerInboxHeaderBar } from '../../components/messaging/FarmerInboxHeaderBar';
import { PaymentSummaryBreakdown } from '../../components/farmer/PaymentSummaryBreakdown';
import {
  FarmerPaymentDetailModal,
  type FarmerPaymentRow,
} from '../../components/farmer/FarmerPaymentDetailModal';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';
import { formatDisplayDate } from '../../utils/greeting';
import type { FarmerTabParamList } from '../../navigation/types';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

type Route = RouteProp<FarmerTabParamList, 'Payments'>;

function paymentStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'transferred' || lower === 'paid') return '#70AD47';
  if (lower === 'pending' || lower === 'processing') return '#FFC000';
  return '#999999';
}

export function FarmerPaymentsScreen() {
  const route = useRoute<Route>();
  const { formatAmount } = useCurrency();
  const userScope = useReadCacheUserScope();
  const [payments, setPayments] = useState<FarmerPaymentRow[]>([]);
  const [summary, setSummary] = useState({
    transferred: 0,
    pending: 0,
    expected: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<FarmerPaymentRow | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerPayments,
        userScope,
        fetchLive: () => getFarmerPayments(),
      });
      const d = result.data;
      setPayments((d.payments ?? []) as FarmerPaymentRow[]);
      if (d.summary) {
        setSummary(d.summary);
      }
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      setError(null);
    } catch (err: unknown) {
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Could not load payments'));
    }
  }, [userScope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const highlightId = route.params?.highlightPaymentId;
    if (!highlightId || payments.length === 0) return;
    const match = payments.find((p) => p.id === highlightId);
    if (match) setSelected(match);
  }, [route.params?.highlightPaymentId, payments]);

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <FarmerInboxHeaderBar />
      <FlatList
        className="flex-1"
        data={payments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
            {error && payments.length === 0 ? <FarmerOfflineBanner message={error} /> : null}
            <PaymentSummaryBreakdown summary={summary} formatAmount={formatAmount} />
          </>
        }
        contentContainerClassName="p-4 pb-8"
        renderItem={({ item }) => {
          const borderColor = paymentStatusColor(item.payment_status);
          return (
            <Pressable onPress={() => setSelected(item)}>
              <KBCard style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}>
                <View className="flex-row items-center">
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F5]">
                    <Ionicons
                      name={item.payment_method === 'M-Pesa' ? 'phone-portrait' : 'card'}
                      size={20}
                      color={borderColor}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-[#333333]">{item.project_name}</Text>
                    <Text className="mt-0.5 text-xs text-[#757575]">
                      {formatDisplayDate(item.created_at)}
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-[#D4AF6A]">{formatAmount(item.amount)}</Text>
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <KBStatusChip
                    label={item.payment_status}
                    variant={
                      item.payment_status.toLowerCase() === 'transferred' ? 'success' : 'pending'
                    }
                  />
                  {item.mpesa_reference ? (
                    <Text className="text-[11px] text-[#757575]">Ref: {item.mpesa_reference}</Text>
                  ) : null}
                </View>
              </KBCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text className="mt-10 text-center text-[#757575]">No payments yet</Text>}
      />
      <FarmerPaymentDetailModal
        payment={selected}
        onClose={() => setSelected(null)}
        formatAmount={formatAmount}
      />
    </View>
  );
}
