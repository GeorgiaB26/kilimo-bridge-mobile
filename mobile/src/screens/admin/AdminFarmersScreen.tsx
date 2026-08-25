import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import {
  fetchProjectHierarchy,
  fetchReferenceData,
  getFarmers,
  type FarmerListQuery,
} from '../../api/client';
import { COUNTRY_LIST } from '../../constants/regional';
import { PENDING_LOCATION_LABEL } from '../../constants/regional';
import { KBSearchBar } from '../../components/KBSearchBar';
import { FarmerListFilterFields } from '../../components/FarmerListFilterFields';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import type { AdminFarmerSummary, AdminFarmersStackParamList } from '../../navigation/types';
import {
  getReadCache,
  loadWithReadCache,
  READ_CACHE_KEYS,
} from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { filterFarmersOffline } from '../../utils/farmerListOfflineFilter';

const FILTER_OPTIONS = ['All', ...COUNTRY_LIST.map((c) => c.name)];
const PAGE_SIZE = 50;

type Nav = NativeStackNavigationProp<AdminFarmersStackParamList, 'FarmersList'>;

type FarmersListPayload = {
  farmers?: AdminFarmerSummary[];
  total?: number;
};

function formatDistrict(district: string): string {
  return district === PENDING_LOCATION_LABEL ? 'Location pending' : district;
}

export function AdminFarmersScreen() {
  const navigation = useNavigation<Nav>();
  const userScope = useReadCacheUserScope();
  const [farmers, setFarmers] = useState<AdminFarmerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [membershipGroupId, setMembershipGroupId] = useState('');
  const [programProjectId, setProgramProjectId] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const farmersRef = useRef<AdminFarmerSummary[]>([]);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const fetchIdRef = useRef(0);

  farmersRef.current = farmers;
  hasMoreRef.current = hasMore;

  const activeSearch = searchQuery.trim();
  const country = countryFilter === 'All' ? undefined : countryFilter;
  const listQuery = useMemo<FarmerListQuery>(
    () => ({
      country,
      q: activeSearch || undefined,
      membership_group_id: membershipGroupId || undefined,
      program_project_id: programProjectId || undefined,
    }),
    [country, activeSearch, membershipGroupId, programProjectId]
  );
  const hasLiveFilters = Boolean(
    listQuery.country || listQuery.q || listQuery.membership_group_id || listQuery.program_project_id
  );

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

  const runSearch = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setSearchError(null);

    const applyOfflineFallback = async () => {
      const cached = await getReadCache<FarmersListPayload>(READ_CACHE_KEYS.adminFarmers, userScope);
      if (!cached) return false;
      const batch = filterFarmersOffline(cached.payload.farmers ?? [], {
        country,
        q: activeSearch,
        membershipGroupName: groups.find((g) => g.id === membershipGroupId)?.name,
      });
      setFarmers(batch);
      setTotal(batch.length);
      setHasMore(false);
      hasMoreRef.current = false;
      setCacheFetchedAt(cached.fetchedAt);
      return true;
    };

    try {
      if (!hasLiveFilters) {
        const result = await loadWithReadCache<FarmersListPayload>({
          cacheKey: READ_CACHE_KEYS.adminFarmers,
          userScope,
          fetchLive: () => getFarmers(PAGE_SIZE, 0),
        });
        if (fetchId !== fetchIdRef.current) return;
        const batch = (result.data.farmers ?? []) as AdminFarmerSummary[];
        const nextTotal = result.data.total ?? batch.length;
        setFarmers(batch);
        setTotal(nextTotal);
        setHasMore(!result.fromCache && batch.length < nextTotal);
        hasMoreRef.current = !result.fromCache && batch.length < nextTotal;
        setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
        return;
      }

      try {
        const d = await getFarmers(PAGE_SIZE, 0, listQuery);
        if (fetchId !== fetchIdRef.current) return;
        const batch = (d.farmers ?? []) as AdminFarmerSummary[];
        const nextTotal = d.total ?? 0;
        setFarmers(batch);
        setTotal(nextTotal);
        setHasMore(batch.length < nextTotal);
        hasMoreRef.current = batch.length < nextTotal;
        setCacheFetchedAt(null);
      } catch {
        if (fetchId !== fetchIdRef.current) return;
        if (await applyOfflineFallback()) return;
        throw new Error('filter failed');
      }
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setFarmers([]);
      setCacheFetchedAt(null);
      setSearchError('Could not load farmers — restart backend: cd backend && npm run dev');
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [hasLiveFilters, listQuery, userScope, groups, membershipGroupId, country, activeSearch]);

  const loadMore = useCallback(async () => {
    if (cacheFetchedAt || loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const fetchId = ++fetchIdRef.current;

    try {
      const offset = farmersRef.current.length;
      const d = await getFarmers(PAGE_SIZE, offset, listQuery);
      if (fetchId !== fetchIdRef.current) return;
      const batch = (d.farmers ?? []) as AdminFarmerSummary[];
      const nextTotal = d.total ?? 0;
      setFarmers((prev) => [...prev, ...batch]);
      setHasMore(offset + batch.length < nextTotal);
      hasMoreRef.current = offset + batch.length < nextTotal;
    } catch {
      /* keep existing list */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cacheFetchedAt, listQuery]);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(), activeSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [activeSearch, countryFilter, membershipGroupId, programProjectId, runSearch]);

  const openFarmer = (farmer: AdminFarmerSummary) => {
    navigation.navigate('FarmerDetail', {
      farmerId: farmer.farmer_id,
      name: farmer.name,
    });
  };

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <View className="px-4 pb-2 pt-4">
        <Text className="mb-1 text-[22px] font-bold text-[#1A4D3E]">
          {activeSearch
            ? `Search results (${total.toLocaleString()})`
            : `All Farmers (${total.toLocaleString()})`}
        </Text>
        {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
        <KBSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={() => runSearch()}
          placeholder="Search name, phone, district, cooperative..."
        />
        {searchError ? <Text className="mb-1.5 text-xs text-[#D32F2F]">{searchError}</Text> : null}
        <Text className="mb-3 text-[13px] text-[#757575]">
          {farmers.length === 0
            ? activeSearch
              ? `No matches for "${activeSearch}"`
              : 'No farmers found'
            : `Showing ${farmers.length.toLocaleString()} of ${total.toLocaleString()}${hasMore ? ' — scroll for more' : ''}`}
        </Text>
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              className={cn(
                'min-h-[38px] items-center justify-center rounded-[20px] border px-4 py-2.5',
                countryFilter === opt
                  ? 'border-[#1A4D3E] bg-[#1A4D3E]'
                  : 'border-[#E0E0E0] bg-white'
              )}
              onPress={() => setCountryFilter(opt)}
            >
              <Text
                className={cn(
                  'text-sm leading-[18px]',
                  countryFilter === opt
                    ? 'font-bold text-white'
                    : 'font-medium text-[#333333]'
                )}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
        <FarmerListFilterFields
          groups={groups}
          projects={projects}
          membershipGroupId={membershipGroupId}
          programProjectId={programProjectId}
          onChangeGroup={setMembershipGroupId}
          onChangeProject={setProgramProjectId}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator size="large" color="#1A4D3E" />
          <Text className="mt-3 text-[#757575]">
            {activeSearch ? `Searching for "${activeSearch}"...` : 'Loading farmers...'}
          </Text>
        </View>
      ) : (
        <FlatList
          className="flex-1"
          contentContainerClassName="px-4 pb-8"
          data={farmers}
          keyExtractor={(item) => item.farmer_id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              className="mb-2 rounded-lg border border-[#E0E0E0] bg-[#F9F9F9] p-3.5 active:bg-[#F0F4F2] active:opacity-90"
              onPress={() => openFarmer(item)}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-base font-semibold text-[#333333]" numberOfLines={1}>{item.name}</Text>
                <Text className="rounded-[10px] bg-[#E8F5F0] px-2 py-0.5 text-[11px] font-semibold text-[#1A4D3E]">{item.country}</Text>
              </View>
              <Text className="mt-1 text-[13px] text-[#757575]">
                {item.phone_number}
                {' · '}
                {formatDistrict(item.district)}
              </Text>
              <Text className="mt-0.5 text-xs text-[#757575]" numberOfLines={1}>{item.membership_group_name}</Text>
            </Pressable>
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator className="my-4" color="#1A4D3E" />
            ) : null
          }
          ListEmptyComponent={
            <Text className="mt-6 text-center italic text-[#757575]">
              {activeSearch ? `No farmers matching "${activeSearch}"` : 'No farmers found'}
            </Text>
          }
        />
      )}
    </View>
  );
}
