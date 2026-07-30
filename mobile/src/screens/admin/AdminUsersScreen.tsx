import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants';
import { getUsers } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { KBSearchBar } from '../../components/KBSearchBar';

const ROLE_COLORS: Record<string, string> = {
  super_admin: COLORS.alert,
  admin: COLORS.primary,
  field_officer: COLORS.info,
  farmer: COLORS.success,
};

const SEARCH_MIN = 1;

export function AdminUsersScreen() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<Array<{
    name: string;
    phone_number: string;
    role: string;
    district?: string;
    status: string;
    created_at?: string;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeSearch = debouncedSearch.length >= SEARCH_MIN ? debouncedSearch : undefined;

  const load = useCallback(async () => {
    if (user?.role !== 'super_admin' && user?.role !== 'admin') return;
    setLoading(true);
    try {
      const d = await getUsers(activeSearch);
      setUsers(d.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.role, activeSearch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>You don't have permission to view users.</Text>
      </View>
    );
  }

  const listHeader = (
    <View>
      <Text style={styles.title}>Platform logins</Text>
      <Text style={styles.scopeNote}>
        Kilimo Bridge accounts (phone OTP or password). These control who can sign in as farmer, agent,
        banking, or admin here — not Loveable admin portal users.
      </Text>
      <Text style={styles.countLine}>{users.length.toLocaleString()} accounts</Text>
      <KBSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, phone, role, district..."
      />
      {searchQuery.length > 0 && searchQuery.length < SEARCH_MIN ? (
        <Text style={styles.searchHint}>Type at least {SEARCH_MIN} characters to search</Text>
      ) : null}
      {activeSearch ? (
        <Text style={styles.subtitle}>Results for "{activeSearch}"</Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={users}
      keyExtractor={(item) => item.phone_number}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={[styles.role, { color: ROLE_COLORS[item.role] ?? COLORS.muted }]}>
              {item.role.replace('_', ' ')}
            </Text>
          </View>
          <Text style={styles.phone}>{item.phone_number}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.status, item.status === 'active' ? styles.statusActive : styles.statusOff]}>
              {item.status}
            </Text>
            {item.district ? <Text style={styles.district}>District: {item.district}</Text> : null}
          </View>
        </View>
      )}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={COLORS.primary} style={styles.loader} />
        ) : (
          <Text style={styles.empty}>
            {activeSearch ? `No users matching "${activeSearch}"` : 'No users found'}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  listContent: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 6 },
  scopeNote: { fontSize: 13, color: COLORS.muted, lineHeight: 18, marginBottom: 8 },
  countLine: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  searchHint: { fontSize: 12, color: COLORS.muted, marginTop: -8, marginBottom: 8 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 12 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1 },
  role: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  phone: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  status: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusActive: { backgroundColor: '#E8F5E9', color: COLORS.success },
  statusOff: { backgroundColor: '#FFEBEE', color: COLORS.alert },
  district: { fontSize: 12, color: COLORS.info },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedText: { color: COLORS.muted, fontSize: 16, textAlign: 'center' },
  loader: { marginTop: 24 },
  empty: { color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 24 },
});
