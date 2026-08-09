import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Sprout } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import {
  listPendingRegistrationOutbox,
  pushPendingRegistration,
  syncAllPendingRegistrations,
  type PendingRegistrationView,
} from '../../services/submitFarmerRegistration';
import {
  dismissFarmerVerificationOutbox,
  listPendingFarmerVerifications,
  pushPendingFarmerVerification,
  syncAllPendingFarmerVerifications,
  type PendingFarmerVerificationView,
} from '../../services/submitFarmerVerificationOutbox';
import { KBCard } from '../../components/ui/KBCard';
import { FarmerStatusChip } from '../../components/agent/FarmerStatusChip';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { OutboxFarmerVerificationCard } from '../../components/OutboxFarmerVerificationCard';
import type { AgentFarmersStackParamList } from '../../navigation/types';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

type FarmerRow = {
  farmer_id: string;
  name: string;
  phone_number: string;
  district: string;
  status: string;
};

type StatusFilterKey = 'all' | 'pending_verification' | 'verified' | 'rejected';

const STATUS_FILTER_OPTIONS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: 'all', label: 'All statuses' },
  { key: 'pending_verification', label: 'Pending review' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

function matchesStatusFilter(status: string, filter: StatusFilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending_verification') {
    return status === 'pending_field_verification' || status === 'pending_review';
  }
  return status === filter;
}

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const userScope = useReadCacheUserScope();
  const route = useRoute<RouteProp<AgentFarmersStackParamList, 'FarmerList'>>();
  const rawFilter = route.params?.statusFilter ?? 'all';
  const statusFilter: StatusFilterKey =
    rawFilter === 'pending_verification' ||
    rawFilter === 'verified' ||
    rawFilter === 'rejected'
      ? rawFilter
      : 'all';
  const navigation = useNavigation<NativeStackNavigationProp<AgentFarmersStackParamList>>();
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [pending, setPending] = useState<PendingRegistrationView[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<PendingFarmerVerificationView[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const hasLoadedRef = useRef(false);

  const loadPending = useCallback(async () => listPendingRegistrationOutbox(), []);
  const loadPendingVerifications = useCallback(async () => listPendingFarmerVerifications(), []);

  const load = useCallback(async () => {
    try {
      const [pendingRegs, pendingVers, result] = await Promise.all([
        loadPending(),
        loadPendingVerifications(),
        loadWithReadCache<{ farmers?: FarmerRow[] }>({
          cacheKey: READ_CACHE_KEYS.agentFarmers,
          userScope,
          fetchLive: async () => {
            const farmersRes = await api.get('/agents/farmers');
            return farmersRes.data;
          },
        }),
      ]);
      setPending(pendingRegs);
      setPendingVerifications(pendingVers);
      setFarmers(result.data.farmers ?? []);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      hasLoadedRef.current = true;
    } catch {
      if (!hasLoadedRef.current) {
        setFarmers([]);
        setCacheFetchedAt(null);
      }
      setPending(await loadPending());
      setPendingVerifications(await loadPendingVerifications());
    } finally {
      setLoading(false);
    }
  }, [loadPending, loadPendingVerifications, userScope]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        await load();
        if (cancelled) return;
        const pendingRegs = await loadPending();
        if (pendingRegs.length > 0) {
          await syncAllPendingRegistrations();
        }
        await syncAllPendingFarmerVerifications();
        if (cancelled) return;
        await load();
      })();
      return () => {
        cancelled = true;
      };
    }, [load, loadPending])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setStatusFilter = (key: StatusFilterKey) => {
    setStatusMenuOpen(false);
    navigation.setParams({
      statusFilter: key === 'all' ? undefined : key,
    });
  };

  const resetFilters = () => {
    setStatusMenuOpen(false);
    navigation.setParams({ statusFilter: undefined });
  };

  const handlePushRegistration = async (id: string, name: string) => {
    setPushingId(id);
    try {
      const result = await pushPendingRegistration(id);
      if (result.success) {
        Alert.alert('Synced', `${name} registered. Awaiting PM approval.`);
        await load();
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync registration');
        setPending(await loadPending());
      }
    } finally {
      setPushingId(null);
    }
  };

  const handlePushVerification = async (item: PendingFarmerVerificationView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingFarmerVerification(item.id);
      if (result.success) {
        Alert.alert(
          'Synced',
          `${item.farmerName} ${item.verificationStatus === 'verified' ? 'verified' : 'rejected'}.`
        );
        await load();
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
        setPendingVerifications(await loadPendingVerifications());
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync verification');
        setPendingVerifications(await loadPendingVerifications());
      }
    } finally {
      setPushingId(null);
    }
  };

  const filteredFarmers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return farmers.filter((f) => {
      if (!matchesStatusFilter(f.status, statusFilter)) return false;
      if (!q) return true;
      return (f.name ?? '').toLowerCase().includes(q);
    });
  }, [farmers, searchQuery, statusFilter]);

  const statusFilterLabel =
    STATUS_FILTER_OPTIONS.find((o) => o.key === statusFilter)?.label ?? 'All statuses';

  const filterActive = statusFilter !== 'all';
  const activeFilterCount = filterActive ? 1 : 0;
  const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : undefined;

  if (loading && !hasLoadedRef.current) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-10"
      data={filteredFarmers}
      keyExtractor={(item) => item.farmer_id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">
            Farmers in {user?.district ?? 'your region'}
          </Text>
          <Text className="mb-3 text-sm text-[#757575]">
            Aggregation centre: {user?.aggregationCenter ?? '—'}
          </Text>

          {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}

          {pending.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-[17px] font-bold text-[#333333]">Offline registrations</Text>
              {pending.map((item) => (
                <KBCard key={item.id} elevated={false} style={{ marginBottom: 8 }}>
                  <Text className="text-base font-semibold text-[#333333]">
                    {item.formData.name || 'Unnamed farmer'}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-[#757575]">
                    {item.formData.phone || 'No phone'} · saved{' '}
                    {new Date(item.createdAt).toLocaleString()}
                    {item.status === 'needs_review'
                      ? ' · Needs your review'
                      : item.status !== 'pending'
                        ? ` · ${item.status}`
                        : ''}
                  </Text>
                  {item.status === 'needs_review' ? (
                    <Text className="mt-1 text-xs font-semibold text-[#D32F2F]">Needs your review</Text>
                  ) : null}
                  {item.syncError ? (
                    <Text className="mt-1 text-xs text-[#D32F2F]">{item.syncError}</Text>
                  ) : null}
                  {item.status !== 'needs_review' ? (
                    <Button
                      className="mt-2 h-10 bg-[#1A4D3E]"
                      disabled={pushingId === item.id}
                      onPress={() => handlePushRegistration(item.id, item.formData.name || 'Unnamed farmer')}
                    >
                      {pushingId === item.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white">Push Registration</Text>
                      )}
                    </Button>
                  ) : null}
                </KBCard>
              ))}
            </View>
          ) : null}

          {pendingVerifications.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-[17px] font-bold text-[#333333]">Queued verifications</Text>
              {pendingVerifications.map((item) => (
                <OutboxFarmerVerificationCard
                  key={item.id}
                  item={item}
                  pushing={pushingId === item.id}
                  onPush={() => handlePushVerification(item)}
                  onDismiss={() =>
                    dismissFarmerVerificationOutbox(item.id).then(async () => {
                      setPendingVerifications(await loadPendingVerifications());
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          <Text className="mb-2 text-[17px] font-bold text-[#333333]">Registered farmers</Text>

          <View className="mb-3 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
              onPress={() => {
                setShowFiltersPanel((open) => !open);
                setStatusMenuOpen(false);
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
                placeholder="Search farmer name"
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
                Status
              </Text>
              <Pressable
                onPress={() => setStatusMenuOpen((o) => !o)}
                className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
                style={webPressable}
              >
                <Text className="text-sm text-[#333333]">{statusFilterLabel}</Text>
                <Text className="text-xs text-[#757575]">{statusMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {statusMenuOpen ? (
                <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                  <ScrollView nestedScrollEnabled>
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        onPress={() => setStatusFilter(opt.key)}
                        className={`px-3 py-2.5 ${
                          statusFilter === opt.key ? 'bg-[#E8F5F0]' : 'bg-white'
                        }`}
                        style={webPressable}
                      >
                        <Text
                          className={`text-sm ${
                            statusFilter === opt.key
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

          {filterActive || searchQuery.trim() ? (
            <Text className="mb-2 text-xs text-[#757575]">
              Showing {filteredFarmers.length} of {farmers.length} farmers
            </Text>
          ) : (
            <View className="mb-2" />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          className="mb-2 rounded-xl border border-[#E8E8E8] bg-white p-4"
          onPress={() =>
            navigation.navigate('FarmerProfile', { farmerId: item.farmer_id, name: item.name })
          }
        >
          <Text className="text-base font-bold text-[#333333]">{item.name}</Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <Sprout size={14} color="#757575" />
            <Text className="text-[13px] text-[#757575]">Farmer · {item.phone_number}</Text>
          </View>
          <View className="mt-2">
            <FarmerStatusChip status={item.status} />
          </View>
          <Text className="mt-2 text-xs font-semibold text-[#1A4D3E]">Tap to view profile →</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text className="text-[#757575]">
          {searchQuery.trim() || filterActive
            ? 'No farmers match your search or filter.'
            : 'No farmers in your region yet. Use Register Farmer in the header.'}
        </Text>
      }
    />
  );
}
