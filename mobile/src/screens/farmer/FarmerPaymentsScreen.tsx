import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, TextInput, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { getFarmerPayments } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
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
type DateSortMode = 'newest' | 'oldest';

const SORT_OPTIONS: Array<{ key: DateSortMode; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : undefined;

function paymentStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === 'transferred' || lower === 'paid') return '#70AD47';
  if (lower === 'pending' || lower === 'processing') return '#FFC000';
  if (lower === 'expected') return '#4472C4';
  return '#999999';
}

function paymentStatusVariant(
  status: string
): 'success' | 'pending' | 'info' | 'warning' | 'danger' {
  const lower = status.toLowerCase();
  if (lower === 'transferred' || lower === 'paid') return 'success';
  if (lower === 'expected') return 'info';
  return 'pending';
}

function paymentDateMs(value?: string): number {
  if (!value?.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<DateSortMode>('newest');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

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

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortMode)?.label ?? 'Newest first';
  const activeFilterCount = sortMode !== 'newest' ? 1 : 0;

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = payments;
    if (q) {
      list = list.filter(
        (p) =>
          (p.project_name ?? '').toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      // Keep expected payouts grouped near the top when sorting newest.
      const aExpected = a.is_expected || a.payment_status.toLowerCase() === 'expected' ? 1 : 0;
      const bExpected = b.is_expected || b.payment_status.toLowerCase() === 'expected' ? 1 : 0;
      if (aExpected !== bExpected) return bExpected - aExpected;
      const diff = paymentDateMs(a.created_at) - paymentDateMs(b.created_at);
      return sortMode === 'newest' ? -diff : diff;
    });
    return sorted;
  }, [payments, searchQuery, sortMode]);

  const resetFilters = () => {
    setSortMenuOpen(false);
    setSortMode('newest');
  };

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <FlatList
        className="flex-1"
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
            {error && payments.length === 0 ? <FarmerOfflineBanner message={error} /> : null}
            <PaymentSummaryBreakdown summary={summary} formatAmount={formatAmount} />

            <View className="mb-3 flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
                onPress={() => {
                  setShowFiltersPanel((open) => !open);
                  setSortMenuOpen(false);
                }}
                className={`flex-row items-center gap-1 rounded-lg px-3 py-2 ${
                  showFiltersPanel || activeFilterCount > 0 ? 'bg-[#1A4D3E]' : 'bg-white'
                }`}
                style={webPressable}
              >
                <Text
                  className={`text-sm font-semibold ${
                    showFiltersPanel || activeFilterCount > 0 ? 'text-white' : 'text-[#333333]'
                  }`}
                >
                  Filters
                </Text>
                {activeFilterCount > 0 ? (
                  <View className="min-w-[18px] items-center rounded-full bg-[#FFD700] px-1.5">
                    <Text className="text-[11px] font-bold text-[#1A1A1A]">{activeFilterCount}</Text>
                  </View>
                ) : (
                  <Text
                    className={`text-xs ${
                      showFiltersPanel || activeFilterCount > 0 ? 'text-white/80' : 'text-[#757575]'
                    }`}
                  >
                    ▼
                  </Text>
                )}
              </Pressable>
              <View className="flex-1 flex-row items-center rounded-lg bg-white px-3">
                <Ionicons name="search" size={18} color="#757575" />
                <TextInput
                  className="flex-1 py-2 pl-2"
                  placeholder="Search by project"
                  placeholderTextColor="#9E9E9E"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>
            </View>

            {showFiltersPanel ? (
              <View className="mb-4 rounded-xl border border-[#E5E5E5] bg-white p-3">
                <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#757575]">
                  Sort by date
                </Text>
                <Pressable
                  onPress={() => setSortMenuOpen((o) => !o)}
                  className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
                  style={webPressable}
                >
                  <Text className="text-sm text-[#333333]">{sortLabel}</Text>
                  <Text className="text-xs text-[#757575]">{sortMenuOpen ? '▲' : '▼'}</Text>
                </Pressable>
                {sortMenuOpen ? (
                  <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                    <ScrollView nestedScrollEnabled>
                      {SORT_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.key}
                          onPress={() => {
                            setSortMode(opt.key);
                            setSortMenuOpen(false);
                          }}
                          className={`px-3 py-2.5 ${
                            sortMode === opt.key ? 'bg-[#E8F5F0]' : 'bg-white'
                          }`}
                          style={webPressable}
                        >
                          <Text
                            className={`text-sm ${
                              sortMode === opt.key
                                ? 'font-semibold text-[#1A4D3E]'
                                : 'text-[#333333]'
                            }`}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <View className="mt-1 flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={resetFilters}
                    className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2.5"
                    style={webPressable}
                  >
                    <Text className="text-sm font-semibold text-[#757575]">Reset</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {searchQuery.trim() || activeFilterCount > 0 ? (
              <Text className="mb-2 text-xs text-[#757575]">
                Showing {filteredPayments.length} of {payments.length} payments
              </Text>
            ) : null}
          </>
        }
        contentContainerClassName="p-4 pb-8"
        renderItem={({ item }) => {
          const borderColor = paymentStatusColor(item.payment_status);
          const isExpected =
            item.is_expected === true || item.payment_status.toLowerCase() === 'expected';
          return (
            <Pressable onPress={() => setSelected(item)} style={webPressable}>
              <KBCard style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}>
                <View className="flex-row items-center">
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F5]">
                    <Ionicons
                      name={
                        isExpected
                          ? 'calendar-outline'
                          : item.payment_method === 'M-Pesa'
                            ? 'phone-portrait'
                            : 'card'
                      }
                      size={20}
                      color={borderColor}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-[#333333]">{item.project_name}</Text>
                    <Text className="mt-0.5 text-xs text-[#757575]">
                      {item.description && item.description !== item.project_name
                        ? `${item.description} · `
                        : ''}
                      {isExpected ? 'Due ' : ''}
                      {formatDisplayDate(item.created_at)}
                    </Text>
                  </View>
                  <Text className="text-lg font-bold text-[#D4AF6A]">{formatAmount(item.amount)}</Text>
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <KBStatusChip
                    label={item.payment_status}
                    variant={paymentStatusVariant(item.payment_status)}
                  />
                  {item.mpesa_reference ? (
                    <Text className="text-[11px] text-[#757575]">Ref: {item.mpesa_reference}</Text>
                  ) : null}
                </View>
              </KBCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text className="mt-10 text-center text-[#757575]">
            {searchQuery.trim() || activeFilterCount > 0
              ? 'No payments match your search or filters.'
              : 'No payments yet'}
          </Text>
        }
      />
      <FarmerPaymentDetailModal
        payment={selected}
        onClose={() => setSelected(null)}
        formatAmount={formatAmount}
      />
    </View>
  );
}
