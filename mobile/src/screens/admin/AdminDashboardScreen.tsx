import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { extractApiError } from '../../utils/feedback';
import { COLORS, API_BASE_URL } from '../../constants';
import { getAdminDashboard } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function AdminDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<{
    totalFarmers: number;
    totalUsers: number;
    pendingPaymentsTotal: number;
    activeProjects: number;
    activeAgents?: number;
    farmersByCountry?: Record<string, number>;
    centresByCountry?: Record<string, number>;
    recentImports: Array<{ status: string; imported_count: number; total_rows: number; created_at: string }>;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminDashboard();
      setStats(data);
      setError(null);
    } catch (err: unknown) {
      const detail = extractApiError(err, '');
      const staleSession = detail.toLowerCase().includes('authentication') || detail.toLowerCase().includes('invalid or expired');
      setError(
        staleSession
          ? 'Session expired after server update — log out and sign in again.'
          : detail || 'Could not load dashboard — is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

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

  const countryEntries = Object.entries(stats?.farmersByCountry ?? {}).sort((a, b) => b[1] - a[1]);

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Admin Dashboard</Text>
      <Text style={styles.role}>{user?.name} · {user?.role?.replace('_', ' ')}</Text>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorApi}>API: {API_BASE_URL}</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        <StatCard label="Farmers" value={stats?.totalFarmers ?? 0} />
        <StatCard label="Users" value={stats?.totalUsers ?? 0} />
        <StatCard label="Active Projects" value={stats?.activeProjects ?? 0} />
        <StatCard label="Pending KES" value={stats?.pendingPaymentsTotal ?? 0} accent />
      </View>

      {countryEntries.length > 0 ? (
        <>
          <Text style={styles.section}>Farmers by Country</Text>
          <View style={styles.countryCard}>
            {countryEntries.map(([country, count]) => (
              <View key={country} style={styles.countryRow}>
                <Text style={styles.countryName}>{country}</Text>
                <Text style={styles.countryCount}>{count.toLocaleString()}</Text>
                {stats?.centresByCountry?.[country] ? (
                  <Text style={styles.centreCount}>
                    {stats.centresByCountry[country]} centres
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: COLORS.muted },
  greeting: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  role: { fontSize: 14, color: COLORS.muted, marginBottom: 20, textTransform: 'capitalize' },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.alert,
  },
  errorText: { color: COLORS.alert, fontSize: 14 },
  errorApi: { color: COLORS.muted, fontSize: 12, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  accent: { color: COLORS.accent },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 18, fontWeight: '600', color: COLORS.primary, marginBottom: 12 },
  countryCard: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 12, marginBottom: 24 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  countryName: { flex: 1, fontSize: 15, fontWeight: '500', color: COLORS.text },
  countryCount: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginRight: 8 },
  centreCount: { fontSize: 11, color: COLORS.muted },
  importRow: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 12, marginBottom: 8 },
  importStatus: { fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  importDetail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  empty: { color: COLORS.muted, fontStyle: 'italic' },
});
