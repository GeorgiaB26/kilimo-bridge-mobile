import React, { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Pressable, Platform } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  Calendar,
  ChartColumn,
  CircleCheck,
  ChevronRight,
  Hourglass,
  User,
  Users,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { KBCard } from '../../components/ui/KBCard';
import { useAuthStore } from '../../store/authStore';
import { getAgentDashboard } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import {
  TaskStatusKpiRow,
  type TaskStatusKpiKey,
} from '../../components/TaskStatusKpiRow';
import type { AgentTabParamList } from '../../navigation/types';

type Nav = BottomTabNavigationProp<AgentTabParamList, 'Dashboard'>;

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

type DashboardData = Awaited<ReturnType<typeof getAgentDashboard>>;

type TaskFilter = TaskStatusKpiKey | 'all';

function navigateNested(
  navigation: Nav,
  tab: 'Farmers' | 'Tasks' | 'Audit',
  params?: Record<string, unknown>
) {
  navigation.dispatch(
    CommonActions.navigate({
      name: tab,
      params,
    })
  );
}

function MetricCard({
  Icon,
  iconColor,
  label,
  value,
  color,
  onPress,
}: {
  Icon: ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  label: string;
  value: number;
  color?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View className="flex-1 rounded-xl border border-[#E8E8E8] bg-white p-3">
      <Icon size={20} color={iconColor ?? '#757575'} />
      <Text className="mt-1 text-2xl font-bold" style={{ color: color ?? '#333333' }}>{value}</Text>
      <Text className="mt-0.5 text-xs text-[#757575]">{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="flex-1 active:opacity-85" style={webPressable}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

function SectionHeading({
  Icon,
  iconColor,
  children,
}: {
  Icon: ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  children: string;
}) {
  return (
    <View className="mb-3 mt-4 flex-row items-center gap-1.5">
      <Icon size={16} color={iconColor ?? '#757575'} />
      <Text className="text-sm font-bold uppercase tracking-wide text-[#757575]">{children}</Text>
    </View>
  );
}

export function AgentDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<Nav>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const summary = await getAgentDashboard();
      setData(summary);
      setLoadError(null);
    } catch (err: unknown) {
      setData(null);
      setLoadError(extractApiError(err, 'Could not load dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const goToTasks = (filter?: TaskFilter) => {
    if (!filter || filter === 'all') {
      navigation.navigate('Tasks');
      return;
    }
    navigation.navigate('Tasks', { filter });
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
  const recentFarmers = (data as { recent_farmers?: Array<{
    farmer_id: string;
    name: string;
    phone_number?: string;
    district?: string;
    sub_county?: string;
    status?: string;
  }> })?.recent_farmers ?? [];
  const recentTasks = (tasks as { recent?: Array<{
    id: string;
    name: string;
    due_date?: string;
    farmer_name?: string;
    status?: string;
  }> })?.recent ?? tasks?.overdue ?? [];

  return (
    <ScrollView
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loadError ? (
        <View className="mb-3 rounded-lg border border-[#EF4444] bg-[#FFEBEE] p-3">
          <Text className="text-sm font-semibold text-[#EF4444]">{loadError}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Pull down to retry or check your connection.</Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-1.5">
        <User size={16} color="#757575" />
        <Text className="text-sm text-[#757575]">
          {user?.name ?? 'Field Agent'} (FA) · {user?.district ?? user?.region ?? 'Your area'}
        </Text>
      </View>

      <SectionHeading Icon={ChartColumn}>Your activity</SectionHeading>
      <View className="mb-4 flex-row gap-2">
        <MetricCard
          Icon={Users}
          label="Farmers registered"
          value={farmers?.total ?? 0}
          onPress={() => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' })}
        />
        <MetricCard
          Icon={Hourglass}
          iconColor="#FBBF24"
          label="Pending verification"
          value={farmers?.pending_verification ?? 0}
          color="#FBBF24"
          onPress={() =>
            navigateNested(navigation, 'Farmers', {
              screen: 'FarmerList',
              params: { statusFilter: 'pending_verification' },
            })
          }
        />
        <MetricCard
          Icon={CircleCheck}
          iconColor="#10B981"
          label="Verified"
          value={farmers?.verified ?? 0}
          color="#10B981"
          onPress={() =>
            navigateNested(navigation, 'Farmers', {
              screen: 'FarmerList',
              params: { statusFilter: 'verified' },
            })
          }
        />
      </View>

      <SectionHeading Icon={Calendar}>Task snapshots</SectionHeading>
      <View className="mb-4">
        <TaskStatusKpiRow
          counts={{
            overdue: tasks?.overdue_count ?? 0,
            in_progress:
              tasks?.in_progress_count ??
              (tasks as { upcoming_count?: number })?.upcoming_count ??
              0,
            not_started: tasks?.not_started_count ?? 0,
            submitted_for_approval: tasks?.submitted_for_approval_count ?? 0,
            rejected: tasks?.rejected_count ?? 0,
            completed: tasks?.completed_count ?? 0,
          }}
          selected={null}
          onSelect={(key) => goToTasks(key)}
        />
      </View>

      {(tasks?.overdue_count ?? 0) > 0 ? (
        <Pressable onPress={() => goToTasks('overdue')} style={webPressable}>
          <KBCard
            style={{
              marginBottom: 12,
              borderLeftWidth: 4,
              borderLeftColor: '#EF4444',
            }}
          >
            <Text className="text-sm font-bold text-[#EF4444]">Overdue highlights</Text>
            {tasks?.overdue?.map((t: { id: string; name?: string; daysOverdue?: number }) => (
              <Text key={t.id} className="mt-1 text-xs text-[#EF4444]">
                • {t.name ?? 'Task'}
                {t.daysOverdue ? ` (${t.daysOverdue} days ago)` : ''}
              </Text>
            ))}
            <View className="mt-2 flex-row items-center gap-1">
              <Text className="text-sm font-semibold text-[#1A4D3E]">View overdue tasks</Text>
              <ChevronRight size={16} color="#1A4D3E" />
            </View>
          </KBCard>
        </Pressable>
      ) : null}

      <KBCard style={{ marginBottom: 12 }}>
        <Pressable
          onPress={() => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' })}
          className="flex-row items-center justify-between"
          style={webPressable}
        >
          <Text className="text-sm font-bold text-[#333333]">
            My farmers ({farmers?.total ?? recentFarmers.length})
          </Text>
          <ChevronRight size={16} color="#1A4D3E" />
        </Pressable>
        {recentFarmers.length > 0 ? (
          recentFarmers.map((f) => (
            <Pressable
              key={f.farmer_id}
              onPress={() =>
                navigateNested(navigation, 'Farmers', {
                  screen: 'FarmerProfile',
                  params: { farmerId: f.farmer_id, name: f.name },
                })
              }
              className="mt-2 border-t border-[#EEE] pt-2"
              style={webPressable}
            >
              <Text className="text-sm font-semibold text-[#333333]">{f.name}</Text>
              <Text className="text-xs text-[#757575]">
                {f.district ?? f.sub_county ?? '—'} · {f.status ?? 'pending'}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text className="mt-2 text-sm text-[#757575]">No farmers in your region yet.</Text>
        )}
      </KBCard>

      {recentTasks.length > 0 ? (
        <KBCard style={{ marginBottom: 12 }}>
          <Pressable
            onPress={() => goToTasks()}
            className="flex-row items-center justify-between"
            style={webPressable}
          >
            <Text className="text-sm font-bold text-[#333333]">Recent tasks</Text>
            <ChevronRight size={16} color="#1A4D3E" />
          </Pressable>
          {recentTasks.slice(0, 5).map((t: {
            id: string;
            name?: string;
            farmer_name?: string;
            due_date?: string | null;
          }) => (
            <Pressable
              key={t.id}
              onPress={() =>
                navigation.navigate('Tasks', {
                  taskId: t.id,
                  highlightTaskId: t.id,
                })
              }
              className="mt-2 border-t border-[#EEE] pt-2"
              style={webPressable}
            >
              <Text className="text-sm font-semibold text-[#333333]">{t.name}</Text>
              <Text className="text-xs text-[#757575]">
                {t.farmer_name ?? 'Task'}
                {t.due_date ? ` · Due ${t.due_date}` : ''}
              </Text>
            </Pressable>
          ))}
        </KBCard>
      ) : null}

      <View className="mb-2 flex-row items-center gap-1.5">
        <Calendar size={16} color="#757575" />
        <Text className="text-sm font-bold uppercase tracking-wide text-[#757575]">Quick actions</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-10"
          onPress={() => navigation.navigate('Tasks', { openAdd: true })}
        >
          <Text>+ Add task</Text>
        </Button>
        <Button
          variant="outline"
          className="h-10"
          onPress={() => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' })}
        >
          <Text>View farmers</Text>
        </Button>
        <Button variant="outline" className="h-10" onPress={() => navigateNested(navigation, 'Audit')}>
          <Text>Activity log</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
