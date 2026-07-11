import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, ScrollView } from 'react-native';
import { COLORS } from '../../constants';
import { getFarmers } from '../../api/client';
import { COUNTRY_LIST } from '../../constants/regional';

const FILTER_OPTIONS = ['All', ...COUNTRY_LIST.map((c) => c.name)];

export function AdminFarmersScreen() {
  const [farmers, setFarmers] = useState<Array<{
    name: string;
    phone_number: string;
    country: string;
    district: string;
    aggregation_center: string | null;
    membership_group_name: string;
    status: string;
    kb_farmer_id?: string;
  }>>([]);
  const [total, setTotal] = useState(0);
  const [countryFilter, setCountryFilter] = useState('All');

  const load = useCallback(async () => {
    try {
      const country = countryFilter === 'All' ? undefined : countryFilter;
      const d = await getFarmers(50, 0, country);
      setFarmers(d.farmers ?? []);
      setTotal(d.total ?? 0);
    } catch { /* */ }
  }, [countryFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>All Farmers ({total.toLocaleString()})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.filterChip, countryFilter === opt && styles.filterChipActive]}
            onPress={() => setCountryFilter(opt)}
          >
            <Text style={[styles.filterText, countryFilter === opt && styles.filterTextActive]}>{opt}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={farmers}
        keyExtractor={(item, i) => item.kb_farmer_id ?? item.phone_number ?? String(i)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.countryBadge}>{item.country}</Text>
            </View>
            <Text style={styles.detail}>{item.phone_number} · {item.district}</Text>
            {item.aggregation_center ? (
              <Text style={styles.centre}>Centre: {item.aggregation_center}</Text>
            ) : null}
            <Text style={styles.coop}>{item.membership_group_name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No farmers found</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  filters: { flexGrow: 0, marginBottom: 12, maxHeight: 40 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: COLORS.background,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, color: COLORS.text },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  centre: { fontSize: 12, color: COLORS.info, marginTop: 2 },
  coop: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
});
