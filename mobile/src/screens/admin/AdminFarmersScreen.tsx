import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { getFarmers, searchFarmers } from '../../api/client';
import { COUNTRY_LIST } from '../../constants/regional';
import { PENDING_LOCATION_LABEL } from '../../constants/regional';
import { KBSearchBar } from '../../components/KBSearchBar';
import type { AdminFarmerSummary, AdminFarmersStackParamList } from '../../navigation/types';

const FILTER_OPTIONS = ['All', ...COUNTRY_LIST.map((c) => c.name)];
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 200;

type Nav = NativeStackNavigationProp<AdminFarmersStackParamList, 'FarmersList'>;

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

export function AdminFarmersScreen() {
  const navigation = useNavigation<Nav>();
  const [farmers, setFarmers] = useState<AdminFarmerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
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
        const d = await searchFarmers(activeSearch, SEARCH_LIMIT);
        if (fetchId !== fetchIdRef.current) return;
        const batch = ((d.farmers ?? []) as AdminFarmerSummary[]).filter((f) =>
          farmerMatchesQuery(f, activeSearch)
        );
        setFarmers(batch);
        setTotal(d.total ?? batch.length);
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }

      const country = countryFilter === 'All' ? undefined : countryFilter;
      const d = await getFarmers(PAGE_SIZE, 0, country);
      if (fetchId !== fetchIdRef.current) return;
      const batch = (d.farmers ?? []) as AdminFarmerSummary[];
      const nextTotal = d.total ?? 0;
      setFarmers(batch);
      setTotal(nextTotal);
      setHasMore(batch.length < nextTotal);
      hasMoreRef.current = batch.length < nextTotal;
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setFarmers([]);
      setSearchError('Could not load farmers — restart backend: cd backend && npm run dev');
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [activeSearch, countryFilter]);

  const loadMore = useCallback(async () => {
    if (activeSearch || loadingMoreRef.current || !hasMoreRef.current) return;
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
  }, [activeSearch, countryFilter]);

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
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {activeSearch
            ? `Search results (${displayedFarmers.length.toLocaleString()})`
            : `All Farmers (${total.toLocaleString()})`}
        </Text>
        <KBSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={() => runSearch()}
          placeholder="Search name, phone, district, cooperative..."
        />
        {activeSearch ? (
          <Pressable onPress={() => setSearchQuery('')} style={styles.clearLink}>
            <Text style={styles.clearLinkText}>Clear search</Text>
          </Pressable>
        ) : null}
        {searchError ? <Text style={styles.searchError}>{searchError}</Text> : null}
        <Text style={styles.subtitle}>
          {activeSearch
            ? displayedFarmers.length > 0
              ? `Showing ${displayedFarmers.length.toLocaleString()} match${displayedFarmers.length === 1 ? '' : 'es'} for "${activeSearch}"`
              : `No matches for "${activeSearch}"`
            : `Showing ${farmers.length.toLocaleString()} of ${total.toLocaleString()}${hasMore ? ' — scroll for more' : ''}`}
        </Text>
        {!activeSearch ? (
          <View style={styles.filterWrap}>
            {FILTER_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                style={[styles.filterChip, countryFilter === opt && styles.filterChipActive]}
                onPress={() => setCountryFilter(opt)}
              >
                <Text style={[styles.filterText, countryFilter === opt && styles.filterTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>
            {activeSearch ? `Searching for "${activeSearch}"...` : 'Loading farmers...'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={displayedFarmers}
          keyExtractor={(item) => item.farmer_id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => openFarmer(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.countryBadge}>{item.country}</Text>
              </View>
              <Text style={styles.detail}>
                {item.phone_number}
                {' · '}
                {formatDistrict(item.district)}
              </Text>
              <Text style={styles.coop} numberOfLines={1}>{item.membership_group_name}</Text>
            </Pressable>
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {activeSearch ? `No farmers matching "${activeSearch}"` : 'No farmers found'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.surface },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: COLORS.muted },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  clearLink: { alignSelf: 'flex-start', marginBottom: 6 },
  clearLinkText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  searchError: { fontSize: 12, color: COLORS.alert, marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 12 },
  filterWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 14, lineHeight: 18, color: COLORS.text, fontWeight: '500' },
  filterTextActive: { color: '#FFFFFF', fontWeight: '700' },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardPressed: { opacity: 0.92, backgroundColor: '#F0F4F2' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1 },
  countryBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: '#E8F5F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  coop: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  footerLoader: { marginVertical: 16 },
  empty: { color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
});
