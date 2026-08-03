import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { KBCard } from '../../components/ui/KBCard';
import { useAuthStore } from '../../store/authStore';
import { getAgentDashboard } from '../../api/client';
import type { AgentTabParamList } from '../../navigation/types';

type Nav = BottomTabNavigationProp<AgentTabParamList, 'Dashboard'>;

type DashboardData = Awaited<ReturnType<typeof getAgentDashboard>>;

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <View className="flex-1 rounded-xl border border-[#E8E8E8] bg-white p-3">
      <Text className="text-lg">{icon}</Text>
      <Text className="mt-1 text-2xl font-bold" style={{ color: color ?? '#333333' }}>{value}</Text>
      <Text className="mt-0.5 text-xs text-[#757575]">{label}</Text>
    </View>
  );
}

export function AgentDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<Nav>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const summary = await getAgentDashboard();
      setData(summary);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  const farmers = data?.farmers;
  const tasks = data?.tasks;

  return (
    <ScrollView
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-sm text-[#757575]">
        👤 {user?.name ?? 'Field Agent'} (FA) · {user?.district ?? user?.region ?? 'Your area'}
      </Text>

      <Text className="mb-3 mt-4 text-sm font-bold uppercase tracking-wide text-[#757575]">
        📊 Your activity
      </Text>
      <View className="mb-4 flex-row gap-2">
        <MetricCard icon="👥" label="Farmers registered" value={farmers?.total ?? 0} />
        <MetricCard
          icon="🟠"
          label="Pending verification"
          value={farmers?.pending_verification ?? 0}
          color="#FBBF24"
        />
        <MetricCard icon="✅" label="Verified" value={farmers?.verified ?? 0} color="#10B981" />
      </View>

      <KBCard style={{ marginBottom: 12 }}>
        <Text className="text-sm font-bold text-[#333333]">⏰ Upcoming tasks (due in 7 days)</Text>
        {tasks?.upcoming_count > 0 ? (
          <>
            <Text className="mt-2 text-[#333333]">{tasks.upcoming_count} task(s) assigned</Text>
            <Pressable onPress={() => navigation.navigate('Tasks')} className="mt-2">
              <Text className="text-sm font-semibold text-[#1A4D3E]">View all →</Text>
            </Pressable>
          </>
        ) : (
          <Text className="mt-2 text-[#757575]">No upcoming tasks</Text>
        )}
      </KBCard>

      <KBCard
        style={{
          marginBottom: 12,
          borderLeftWidth: 4,
          borderLeftColor: tasks?.overdue_count ? '#EF4444' : '#E8E8E8',
        }}
      >
        <Text className="text-sm font-bold text-[#333333]">⚠️ Overdue tasks</Text>
        {tasks?.overdue_count > 0 ? (
          <>
            <Text className="mt-2 font-bold text-[#EF4444]">
              🔴 {tasks.overdue_count} task(s) overdue
            </Text>
            {tasks.overdue?.map((t: { id: string; name?: string; daysOverdue?: number }) => (
              <Text key={t.id} className="mt-1 text-xs text-[#EF4444]">
                • {t.name ?? 'Task'}
                {t.daysOverdue ? ` (${t.daysOverdue} days ago)` : ''}
              </Text>
            ))}
            <Pressable onPress={() => navigation.navigate('Tasks')} className="mt-2">
              <Text className="text-sm font-semibold text-[#1A4D3E]">View all →</Text>
            </Pressable>
          </>
        ) : (
          <Text className="mt-2 text-[#757575]">No overdue tasks</Text>
        )}
      </KBCard>

      <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
        📅 Quick actions
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-10"
          onPress={() => navigation.navigate('Tasks')}
        >
          <Text>+ Add task</Text>
        </Button>
        <Button variant="outline" className="h-10" onPress={() => navigation.navigate('Farmers')}>
          <Text>View farmers</Text>
        </Button>
        <Button variant="outline" className="h-10" onPress={() => navigation.navigate('Audit')}>
          <Text>Activity log</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
