import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { extractApiError } from '../../utils/feedback';
import { API_BASE_URL } from '../../constants';
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
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1A4D3E" />
        <Text className="mt-3 text-[#757575]">Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-2xl font-bold text-[#1A4D3E]">Admin Dashboard</Text>
      <Text className="mb-5 text-sm capitalize text-[#757575]">
        {user?.name} · {user?.role?.replace('_', ' ')}
      </Text>

      {error ? (
        <View className="mb-4 rounded-lg border-l-4 border-[#D32F2F] bg-[#FFEBEE] p-3">
          <Text className="text-sm text-[#D32F2F]">{error}</Text>
          <Text className="mt-1.5 text-xs text-[#757575]">API: {API_BASE_URL}</Text>
        </View>
      ) : null}

      <View className="mb-6 flex-row flex-wrap gap-2.5">
        <StatCard label="Farmers" value={stats?.totalFarmers ?? 0} />
        <StatCard label="Users" value={stats?.totalUsers ?? 0} />
        <StatCard label="Active Projects" value={stats?.activeProjects ?? 0} />
        <StatCard label="Pending KES" value={stats?.pendingPaymentsTotal ?? 0} accent />
      </View>

      {countryEntries.length > 0 ? (
        <>
          <Text className="mb-3 text-lg font-semibold text-[#1A4D3E]">Farmers by Country</Text>
          <View className="mb-6 rounded-lg bg-[#F9F9F9] p-3">
            {countryEntries.map(([country, count]) => (
              <View key={country} className="flex-row items-center border-b border-[#E0E0E0] py-2">
                <Text className="flex-1 text-[15px] font-medium text-[#333333]">{country}</Text>
                <Text className="mr-2 text-base font-bold text-[#1A4D3E]">{count.toLocaleString()}</Text>
                {stats?.centresByCountry?.[country] ? (
                  <Text className="text-[11px] text-[#757575]">
                    {stats.centresByCountry[country]} centres
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text className="mb-3 text-lg font-semibold text-[#1A4D3E]">Recent Imports</Text>
      {(stats?.recentImports ?? []).map((imp, i) => (
        <View key={i} className="mb-2 rounded-lg bg-[#F9F9F9] p-3">
          <Text className="font-semibold capitalize text-[#333333]">{imp.status}</Text>
          <Text className="mt-0.5 text-[13px] text-[#757575]">
            {imp.imported_count}/{imp.total_rows} rows · {imp.created_at?.slice(0, 10)}
          </Text>
        </View>
      ))}
      {(stats?.recentImports ?? []).length === 0 ? (
        <Text className="italic text-[#757575]">No imports yet</Text>
      ) : null}
    </ScrollView>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View className="min-w-[45%] flex-1 items-center rounded-lg bg-[#F9F9F9] p-4">
      <Text className={cn('text-2xl font-bold text-[#1A4D3E]', accent && 'text-[#D4AF6A]')}>
        {value.toLocaleString()}
      </Text>
      <Text className="mt-1 text-xs text-[#757575]">{label}</Text>
    </View>
  );
}
