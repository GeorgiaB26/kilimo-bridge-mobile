import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, Pressable } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Sprout } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  fetchProjectHierarchy,
  fetchReferenceData,
  getAgentFarmers,
  type FarmerListQuery,
} from '../../api/client';
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
import { KBSearchBar } from '../../components/KBSearchBar';
import { FarmerListFilterFields } from '../../components/FarmerListFilterFields';
import { FarmerStatusChip } from '../../components/agent/FarmerStatusChip';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { OutboxFarmerVerificationCard } from '../../components/OutboxFarmerVerificationCard';
import type { AgentFarmersStackParamList } from '../../navigation/types';
import { getReadCache, loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { filterFarmersOffline } from '../../utils/farmerListOfflineFilter';

type FarmerRow = {
  farmer_id: string;
  name: string;
  phone_number: string;
  district: string;
  status: string;
  pending_picture_url?: string | null;
  membership_group_name?: string;
  country?: string;
};

type FarmersPayload = { farmers?: FarmerRow[]; total?: number };

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
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [membershipGroupId, setMembershipGroupId] = useState('');
  const [programProjectId, setProgramProjectId] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  const activeSearch = searchQuery.trim();
  const listQuery = useMemo<FarmerListQuery>(
    () => ({
      q: activeSearch || undefined,
      membership_group_id: membershipGroupId || undefined,
      program_project_id: programProjectId || undefined,
    }),
    [activeSearch, membershipGroupId, programProjectId]
  );
  const hasLiveFilters = Boolean(
    listQuery.q || listQuery.membership_group_id || listQuery.program_project_id
  );
  const filterSig = `${activeSearch}\0${membershipGroupId}\0${programProjectId}`;
  const lastFetchedSig = useRef<string | null>(null);

  const loadPending = useCallback(async () => listPendingRegistrationOutbox(), []);
  const loadPendingVerifications = useCallback(async () => listPendingFarmerVerifications(), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchReferenceData().catch(() => null),
      fetchProjectHierarchy().catch(() => null),
    ]).then(([ref, hierarchy]) => {
      if (cancelled) return;
      setGroups(ref?.membershipGroupOptions ?? []);
      setProjects((hierarchy?.projects ?? []).map((p) => ({ id: p.id, name: p.name })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOutbox = useCallback(async () => {
    const pendingRegs = await loadPending();
    setPending(pendingRegs);
    setPendingVerifications(await loadPendingVerifications());
    if (pendingRegs.length > 0) {
      await syncAllPendingRegistrations();
      setPending(await loadPending());
    }
    await syncAllPendingFarmerVerifications();
    setPendingVerifications(await loadPendingVerifications());
  }, [loadPending, loadPendingVerifications]);

  const loadFarmers = useCallback(async () => {
    try {
      if (!hasLiveFilters) {
        const result = await loadWithReadCache<FarmersPayload>({
          cacheKey: READ_CACHE_KEYS.agentFarmers,
          userScope,
          fetchLive: () => getAgentFarmers<FarmerRow>(),
        });
        setFarmers(result.data.farmers ?? []);
        setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
        return;
      }
      try {
        const data = await getAgentFarmers<FarmerRow>(listQuery);
        setFarmers(data.farmers ?? []);
        setCacheFetchedAt(null);
      } catch {
        const cached = await getReadCache<FarmersPayload>(READ_CACHE_KEYS.agentFarmers, userScope);
        if (!cached) throw new Error('offline');
        setFarmers(
          filterFarmersOffline(cached.payload.farmers ?? [], {
            q: activeSearch,
            membershipGroupName: groups.find((g) => g.id === membershipGroupId)?.name,
          })
        );
        setCacheFetchedAt(cached.fetchedAt);
      }
    } catch {
      setFarmers([]);
      setCacheFetchedAt(null);
    }
  }, [hasLiveFilters, listQuery, userScope, groups, membershipGroupId, activeSearch]);

  const loadFarmersRef = useRef(loadFarmers);
  loadFarmersRef.current = loadFarmers;
  const filterSigRef = useRef(filterSig);
  filterSigRef.current = filterSig;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          await loadOutbox();
        } catch {
          setPending(await loadPending());
          setPendingVerifications(await loadPendingVerifications());
        }
        if (cancelled) return;
        await loadFarmersRef.current();
        lastFetchedSig.current = filterSigRef.current;
        setReady(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [loadOutbox, loadPending, loadPendingVerifications])
  );

  useEffect(() => {
    if (!ready) return;
    if (lastFetchedSig.current === filterSig) return;
    const timer = setTimeout(() => {
      lastFetchedSig.current = filterSig;
      void loadFarmers();
    }, activeSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [ready, filterSig, loadFarmers, activeSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOutbox();
    } catch {
      setPending(await loadPending());
      setPendingVerifications(await loadPendingVerifications());
    }
    await loadFarmers();
    lastFetchedSig.current = filterSig;
    setRefreshing(false);
  };

  const handlePushRegistration = async (id: string, name: string) => {
    setPushingId(id);
    try {
      const result = await pushPendingRegistration(id);
      if (result.success) {
        Alert.alert('Synced', `${name} registered. Awaiting PM approval.`);
        await loadOutbox();
        await loadFarmers();
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
        await loadOutbox();
        await loadFarmers();
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

  if (!ready) {
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
    if (statusFilter === 'pending_photo') {
      return Boolean(f.pending_picture_url);
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
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">
            Members in {user?.district ?? 'your region'}
          </Text>
          <Text className="mb-3 text-sm text-[#757575]">
            Aggregation centre: {user?.aggregationCenter ?? '—'}
          </Text>

          <KBSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, phone, district..."
          />
          <FarmerListFilterFields
            groups={groups}
            projects={projects}
            membershipGroupId={membershipGroupId}
            programProjectId={programProjectId}
            onChangeGroup={setMembershipGroupId}
            onChangeProject={setProgramProjectId}
          />

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

          <Text className="mb-2 text-[17px] font-bold text-[#333333]">Registered members</Text>
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
            <Text className="text-[13px] text-[#757575]">Member · {item.phone_number}</Text>
          </View>
          <View className="mt-2">
            <FarmerStatusChip status={item.status} />
          </View>
          {item.pending_picture_url ? (
            <Text className="mt-2 text-xs font-bold text-[#B45309]">New photo waiting for approval</Text>
          ) : null}
          <Text className="mt-2 text-xs font-semibold text-[#1A4D3E]">Tap to view profile →</Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text className="text-[#757575]">
          {filterLabel || hasLiveFilters
            ? 'No members match the current filters.'
            : 'No members in your region yet. Use REGISTER NEW MEMBER in the header.'}
        </Text>
      }
    />
  );
}
