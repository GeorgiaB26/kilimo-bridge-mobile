import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { COLORS } from '../../constants';
import { getAdminDashboard } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function AdminDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<{
    totalFarmers: number;
    totalUsers: number;
    pendingPaymentsTotal: number;
    activeProjects: number;
    recentImports: Array<{ status: string; imported_count: number; total_rows: number; created_at: string }>;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await getAdminDashboard();
      setStats(data);
    } catch { /* */ }
  };

  useEffect(() => { load(); }, []);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.greeting}>Admin Dashboard</Text>
      <Text style={styles.role}>{user?.name} · {user?.role?.replace('_', ' ')}</Text>
      <View style={styles.grid}>
        <StatCard label="Farmers" value={stats?.totalFarmers ?? 0} />
        <StatCard label="Users" value={stats?.totalUsers ?? 0} />
        <StatCard label="Active Projects" value={stats?.activeProjects ?? 0} />
        <StatCard label="Pending KES" value={stats?.pendingPaymentsTotal ?? 0} accent />
      </View>
      <Text style={styles.section}>Recent Imports</Text>
      {(stats?.recentImports ?? []).map((imp, i) => (
        <View key={i} style={styles.importRow}>
          <Text style={styles.importStatus}>{imp.status}</Text>
          <Text style={styles.importDetail}>
            {imp.imported_count}/{imp.total_rows} rows · {imp.created_at?.slice(0, 10)}
          </Text>
        </View>
      ))}
      {(stats?.recentImports ?? []).length === 0 ? (
        <Text style={styles.empty}>No imports yet</Text>
      ) : null}
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, accent && styles.accent]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  role: { fontSize: 14, color: COLORS.muted, marginBottom: 20, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  accent: { color: COLORS.accent },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 18, fontWeight: '600', color: COLORS.primary, marginBottom: 12 },
  importRow: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 12, marginBottom: 8 },
  importStatus: { fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  importDetail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  empty: { color: COLORS.muted, fontStyle: 'italic' },
});
