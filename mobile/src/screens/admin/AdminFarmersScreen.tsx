import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { getFarmers, searchFarmers } from '../../api/client';
import { COUNTRY_LIST } from '../../constants/regional';
import { PENDING_LOCATION_LABEL } from '../../constants/regional';
import { KBSearchBar } from '../../components/KBSearchBar';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import type { AdminFarmerSummary, AdminFarmersStackParamList } from '../../navigation/types';
import {
  getReadCache,
  loadWithReadCache,
  READ_CACHE_KEYS,
} from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

const FILTER_OPTIONS = ['All', ...COUNTRY_LIST.map((c) => c.name)];
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 200;

type Nav = NativeStackNavigationProp<AdminFarmersStackParamList, 'FarmersList'>;

type FarmersListPayload = {
  farmers?: AdminFarmerSummary[];
  total?: number;
};

function formatDistrict(district: string): string {
  return district === PENDING_LOCATION_LABEL ? 'Location pending' : district;
}

function farmerMatchesQuery(farmer: AdminFarmerSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const haystacks = [
    farmer.name,
    farmer.phone_number,
    farmer.district,
    farmer.membership_group_name,
    farmer.kb_farmer_id,
    farmer.country,
  ];
  if (haystacks.some((v) => v?.toLowerCase().includes(q))) return true;
  if (digits.length >= 3 && farmer.phone_number?.replace(/\D/g, '').includes(digits)) return true;
  return q.split(/\s+/).some(
    (part) => part.length >= 2 && farmer.name?.toLowerCase().includes(part)
  );
}

function filterCachedFarmers(
  farmers: AdminFarmerSummary[],
  opts: { search?: string; country?: string }
): AdminFarmerSummary[] {
  let list = farmers;
  if (opts.country && opts.country !== 'All') {
    list = list.filter((f) => f.country === opts.country);
  }
  if (opts.search?.trim()) {
    list = list.filter((f) => farmerMatchesQuery(f, opts.search!));
  }
  return list;
}

export function AdminFarmersScreen() {
  const navigation = useNavigation<Nav>();
  const userScope = useReadCacheUserScope();
  const [farmers, setFarmers] = useState<AdminFarmerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
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

  const runSearch = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setSearchError(null);

    try {
      if (activeSearch) {
        try {
          const d = await searchFarmers(activeSearch, SEARCH_LIMIT);
          if (fetchId !== fetchIdRef.current) return;
          const batch = ((d.farmers ?? []) as AdminFarmerSummary[]).filter((f) =>
            farmerMatchesQuery(f, activeSearch)
          );
          setFarmers(batch);
          setTotal(d.total ?? batch.length);
          setHasMore(false);
          hasMoreRef.current = false;
          setCacheFetchedAt(null);
          return;
        } catch {
          const cached = await getReadCache<FarmersListPayload>(
            READ_CACHE_KEYS.adminFarmers,
            userScope
          );
          if (fetchId !== fetchIdRef.current) return;
          if (cached) {
            const batch = filterCachedFarmers(cached.payload.farmers ?? [], {
              search: activeSearch,
              country: countryFilter,
            });
            setFarmers(batch);
            setTotal(batch.length);
            setHasMore(false);
            hasMoreRef.current = false;
            setCacheFetchedAt(cached.fetchedAt);
            return;
          }
          throw new Error('search failed');
        }
      }

      const country = countryFilter === 'All' ? undefined : countryFilter;
      if (country) {
        try {
          const d = await getFarmers(PAGE_SIZE, 0, country);
          if (fetchId !== fetchIdRef.current) return;
          const batch = (d.farmers ?? []) as AdminFarmerSummary[];
          const nextTotal = d.total ?? 0;
          setFarmers(batch);
          setTotal(nextTotal);
          setHasMore(batch.length < nextTotal);
          hasMoreRef.current = batch.length < nextTotal;
          setCacheFetchedAt(null);
          return;
        } catch {
          const cached = await getReadCache<FarmersListPayload>(
            READ_CACHE_KEYS.adminFarmers,
            userScope
          );
          if (fetchId !== fetchIdRef.current) return;
          if (cached) {
            const batch = filterCachedFarmers(cached.payload.farmers ?? [], { country });
            setFarmers(batch);
            setTotal(batch.length);
            setHasMore(false);
            hasMoreRef.current = false;
            setCacheFetchedAt(cached.fetchedAt);
            return;
          }
          throw new Error('country filter failed');
        }
      }

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
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setFarmers([]);
      setCacheFetchedAt(null);
      setSearchError('Could not load farmers — restart backend: cd backend && npm run dev');
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [activeSearch, countryFilter, userScope]);

  const loadMore = useCallback(async () => {
    if (activeSearch || cacheFetchedAt || loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const fetchId = ++fetchIdRef.current;

    try {
      const country = countryFilter === 'All' ? undefined : countryFilter;
      const offset = farmersRef.current.length;
      const d = await getFarmers(PAGE_SIZE, offset, country);
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
  }, [activeSearch, countryFilter, cacheFetchedAt]);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(), activeSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [activeSearch, countryFilter, runSearch]);

  const openFarmer = (farmer: AdminFarmerSummary) => {
    navigation.navigate('FarmerDetail', {
      farmerId: farmer.farmer_id,
      name: farmer.name,
    });
  };

  const displayedFarmers = activeSearch
    ? farmers.filter((f) => farmerMatchesQuery(f, activeSearch))
    : farmers;

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <View className="px-4 pb-2 pt-4">
        <Text className="mb-1 text-[22px] font-bold text-[#1A4D3E]">
          {activeSearch
            ? `Search results (${displayedFarmers.length.toLocaleString()})`
            : `All Farmers (${total.toLocaleString()})`}
        </Text>
        {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
        <KBSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={() => runSearch()}
          placeholder="Search name, phone, district, cooperative..."
        />
        {activeSearch ? (
          <Pressable onPress={() => setSearchQuery('')} className="mb-1.5 self-start">
            <Text className="text-[13px] font-semibold text-[#1A4D3E]">Clear search</Text>
          </Pressable>
        ) : null}
        {searchError ? <Text className="mb-1.5 text-xs text-[#D32F2F]">{searchError}</Text> : null}
        <Text className="mb-3 text-[13px] text-[#757575]">
          {activeSearch
            ? displayedFarmers.length > 0
              ? `Showing ${displayedFarmers.length.toLocaleString()} match${displayedFarmers.length === 1 ? '' : 'es'} for "${activeSearch}"`
              : `No matches for "${activeSearch}"`
            : `Showing ${farmers.length.toLocaleString()} of ${total.toLocaleString()}${hasMore ? ' — scroll for more' : ''}`}
        </Text>
        {!activeSearch ? (
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
        ) : null}
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
          data={displayedFarmers}
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
