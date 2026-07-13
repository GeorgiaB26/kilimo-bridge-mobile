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
import { getFarmers } from '../../api/client';
import { COUNTRY_LIST } from '../../constants/regional';
import { PENDING_LOCATION_LABEL } from '../../../../shared/src/constants';
import { KBSearchBar } from '../../components/KBSearchBar';
import type { AdminFarmerSummary, AdminFarmersStackParamList } from '../../navigation/types';

const FILTER_OPTIONS = ['All', ...COUNTRY_LIST.map((c) => c.name)];
const PAGE_SIZE = 50;
const SEARCH_MIN = 2;

type Nav = NativeStackNavigationProp<AdminFarmersStackParamList, 'FarmersList'>;

function formatDistrict(district: string): string {
  return district === PENDING_LOCATION_LABEL ? 'Location pending' : district;
}

export function AdminFarmersScreen() {
  const navigation = useNavigation<Nav>();
  const [farmers, setFarmers] = useState<AdminFarmerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const farmersRef = useRef<AdminFarmerSummary[]>([]);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  farmersRef.current = farmers;
  hasMoreRef.current = hasMore;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeSearch = debouncedSearch.length >= SEARCH_MIN ? debouncedSearch : undefined;

  const loadPage = useCallback(async (reset: boolean) => {
    if (!reset && (loadingMoreRef.current || !hasMoreRef.current)) return;

    if (reset) setLoading(true);
    else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }

    try {
      const country = countryFilter === 'All' ? undefined : countryFilter;
      const offset = reset ? 0 : farmersRef.current.length;
      const d = await getFarmers(PAGE_SIZE, offset, country, activeSearch);
      const batch = (d.farmers ?? []) as AdminFarmerSummary[];
      const nextTotal = d.total ?? 0;
      setTotal(nextTotal);
      setFarmers((prev) => (reset ? batch : [...prev, ...batch]));
      setHasMore(offset + batch.length < nextTotal);
    } catch {
      if (reset) setFarmers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [countryFilter, activeSearch]);

  useEffect(() => {
    setHasMore(true);
    hasMoreRef.current = true;
    loadPage(true);
  }, [countryFilter, activeSearch, loadPage]);

  const openFarmer = (farmer: AdminFarmerSummary) => {
    navigation.navigate('FarmerDetail', {
      farmerId: farmer.farmer_id,
      name: farmer.name,
    });
  };

  const listHeader = (
    <View>
      <Text style={styles.title}>All Farmers ({total.toLocaleString()})</Text>
      <KBSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, phone, district, cooperative..."
      />
      {searchQuery.length > 0 && searchQuery.length < SEARCH_MIN ? (
        <Text style={styles.searchHint}>Type at least {SEARCH_MIN} characters to search</Text>
      ) : null}
      <Text style={styles.subtitle}>
        {activeSearch
          ? `${total.toLocaleString()} match${total === 1 ? '' : 'es'} for "${activeSearch}"`
          : `Showing ${farmers.length.toLocaleString()} of ${total.toLocaleString()}${hasMore ? ' — scroll for more' : ''}`}
      </Text>
      <View style={styles.filterWrap}>
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.filterChip, countryFilter === opt && styles.filterChipActive]}
            onPress={() => setCountryFilter(opt)}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${opt}`}
          >
            <Text style={[styles.filterText, countryFilter === opt && styles.filterTextActive]}>
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (loading && farmers.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading farmers...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={farmers}
      keyExtractor={(item) => item.farmer_id}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => openFarmer(item)}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.name}`}
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
          {item.aggregation_center ? (
            <Text style={styles.centre}>Centre: {item.aggregation_center}</Text>
          ) : null}
          <Text style={styles.coop} numberOfLines={1}>{item.membership_group_name}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.tapHint}>View profile</Text>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </View>
        </Pressable>
      )}
      onEndReached={() => loadPage(false)}
      onEndReachedThreshold={0.4}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator style={styles.footerLoader} color={COLORS.primary} />
        ) : null
      }
      ListEmptyComponent={<Text style={styles.empty}>No farmers found</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: COLORS.surface },
  listContent: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: COLORS.muted },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  searchHint: { fontSize: 12, color: COLORS.muted, marginTop: -8, marginBottom: 8 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 12 },
  filterWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
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
  centre: { fontSize: 12, color: COLORS.info, marginTop: 2 },
  coop: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 4 },
  tapHint: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  footerLoader: { marginVertical: 16 },
  empty: { color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
});
