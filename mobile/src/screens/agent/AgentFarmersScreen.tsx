import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { RoleHeroHeader } from '../../components/RoleHeroHeader';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { KBSearchBar } from '../../components/KBSearchBar';

type FarmerRow = {
  farmer_id?: string;
  name: string;
  phone_number: string;
  district: string;
  status: string;
  village?: string;
};

const FILTERS = ['All', 'Active', 'Pending'] as const;

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/agents/farmers');
      setFarmers(data.farmers ?? []);
    } catch {
      setFarmers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = farmers.filter((f) => {
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.phone_number.includes(q) ||
      f.district?.toLowerCase().includes(q);
    const matchF =
      filter === 'All' ||
      (filter === 'Active' && f.status === 'Active') ||
      (filter === 'Pending' && f.status !== 'Active');
    return matchQ && matchF;
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={filtered}
      keyExtractor={(item, i) => item.farmer_id ?? `${item.phone_number}-${i}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      ListHeaderComponent={
        <View>
          <RoleHeroHeader
            title="My farmers"
            subtitle={`${user?.district ?? 'Your region'} · ${user?.aggregationCenter ?? 'Field agent'}`}
            icon="people"
          />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statN}>{farmers.length}</Text>
              <Text style={styles.statL}>Total</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{farmers.filter((f) => f.status === 'Active').length}</Text>
              <Text style={styles.statL}>Active</Text>
            </View>
          </View>
          <KBSearchBar value={query} onChangeText={setQuery} placeholder="Search name, phone, district…" />
          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[styles.chip, filter === f && styles.chipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <KBCard>
          <View style={styles.cardRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.phone_number}</Text>
              <Text style={styles.meta}>{item.district}{item.village ? ` · ${item.village}` : ''}</Text>
            </View>
            <KBStatusChip
              label={item.status}
              variant={item.status === 'Active' ? 'success' : 'pending'}
            />
          </View>
        </KBCard>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No farmers yet — tap Register to add a farmer</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stat: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statN: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  statL: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 32, fontSize: 15 },
});
