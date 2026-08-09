import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, Pressable } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
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

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const userScope = useReadCacheUserScope();
  const route = useRoute<RouteProp<AgentFarmersStackParamList, 'FarmerList'>>();
  const statusFilter = route.params?.statusFilter ?? 'all';
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

  const loadPending = useCallback(async () => listPendingRegistrationOutbox(), []);
  const loadPendingVerifications = useCallback(async () => listPendingFarmerVerifications(), []);

  const load = useCallback(async () => {
    try {
      const pendingRegs = await loadPending();
      setPending(pendingRegs);
      setPendingVerifications(await loadPendingVerifications());

      if (pendingRegs.length > 0) {
        await syncAllPendingRegistrations();
        setPending(await loadPending());
      }
      await syncAllPendingFarmerVerifications();
      setPendingVerifications(await loadPendingVerifications());

      const result = await loadWithReadCache<{ farmers?: FarmerRow[] }>({
        cacheKey: READ_CACHE_KEYS.agentFarmers,
        userScope,
        fetchLive: async () => {
          const farmersRes = await api.get('/agents/farmers');
          return farmersRes.data;
        },
      });
      setFarmers(result.data.farmers ?? []);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
    } catch {
      setFarmers([]);
      setCacheFetchedAt(null);
      setPending(await loadPending());
      setPendingVerifications(await loadPendingVerifications());
    } finally {
      setLoading(false);
    }
  }, [loadPending, loadPendingVerifications, userScope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  const filteredFarmers = farmers.filter((f) => {
    if (!statusFilter || statusFilter === 'all') return true;
    if (statusFilter === 'pending_verification') {
      return f.status === 'pending_field_verification' || f.status === 'pending_review';
    }
    return f.status === statusFilter;
  });

  const filterLabel =
    statusFilter === 'pending_verification'
      ? 'Pending verification'
      : statusFilter === 'verified'
        ? 'Verified'
        : statusFilter === 'rejected'
          ? 'Rejected'
          : null;

  return (
    <FlatList
      className="flex-1 p-4"
      data={filteredFarmers}
      keyExtractor={(item) => item.farmer_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">
            Farmers in {user?.district ?? 'your region'}
          </Text>
          <Text className="mb-3 text-sm text-[#757575]">
            Aggregation centre: {user?.aggregationCenter ?? '—'}
          </Text>

          {filterLabel ? (
            <View className="mb-3 rounded-lg border border-[#1A4D3E] bg-[#E8F5E9] px-3 py-2">
              <Text className="text-sm font-semibold text-[#1A4D3E]">
                Filter: {filterLabel} ({filteredFarmers.length})
              </Text>
            </View>
          ) : null}

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
          {filterLabel
            ? `No farmers match the “${filterLabel}” filter.`
            : 'No farmers in your region yet. Use Register Farmer in the header.'}
        </Text>
      }
    />
  );
}
