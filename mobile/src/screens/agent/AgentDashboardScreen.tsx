import React, { useCallback, useMemo, useState, type ComponentType } from 'react';
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
import { KpiMetricCard } from '../../components/ui/KpiMetricCard';
import { useAuthStore } from '../../store/authStore';
import { getAgentDashboard } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import type { AgentTabParamList } from '../../navigation/types';
import { TaskNotificationBanner } from '../../components/notifications/TaskNotificationBanner';
import { useTaskNotificationBanners } from '../../hooks/useTaskNotificationBanners';
import { navigateFromNotification } from '../../utils/farmerNotificationNavigation';
import {
  TaskStatusKpiRow,
  chunkKpiRows,
  kpiColumnsPerRow,
  type TaskStatusKpiKey,
} from '../../components/TaskStatusKpiRow';
import { useTabScreenContentContainerStyle } from '../../navigation/FloatingTabBar';

type Nav = BottomTabNavigationProp<AgentTabParamList, 'Dashboard'>;

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

type DashboardData = Awaited<ReturnType<typeof getAgentDashboard>>;

type TaskFilter = TaskStatusKpiKey;

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
  const { notifications: taskNotifications, dismiss: dismissTaskNotification } =
    useTaskNotificationBanners();
  const scrollContentStyle = useTabScreenContentContainerStyle();

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

  const goToTasks = (filter: TaskFilter | 'all', taskId?: string) => {
    navigateNested(navigation, 'Tasks', {
      filter,
      ...(taskId ? { taskId, highlightTaskId: taskId } : {}),
    });
  };

  const farmers = data?.farmers;
  const tasks = data?.tasks;

  const activityKpiRows = useMemo(() => {
    const cards = [
      {
        key: 'total',
        label: 'Members registered',
        value: farmers?.total ?? 0,
        Icon: Users,
        iconColor: '#757575',
        countColor: '#333333',
        onPress: () => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' }),
      },
      {
        key: 'pending_verification',
        label: 'Pending verification',
        value: farmers?.pending_verification ?? 0,
        Icon: Hourglass,
        iconColor: '#FBBF24',
        countColor: '#FBBF24',
        onPress: () =>
          navigateNested(navigation, 'Farmers', {
            screen: 'FarmerList',
            params: { statusFilter: 'pending_verification' },
          }),
      },
      {
        key: 'verified',
        label: 'Verified',
        value: farmers?.verified ?? 0,
        Icon: CircleCheck,
        iconColor: '#10B981',
        countColor: '#10B981',
        onPress: () =>
          navigateNested(navigation, 'Farmers', {
            screen: 'FarmerList',
            params: { statusFilter: 'verified' },
          }),
      },
    ];
    return { rows: chunkKpiRows(cards), columnsPerRow: kpiColumnsPerRow(cards.length) };
  }, [farmers?.pending_verification, farmers?.total, farmers?.verified, navigation]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F5F5F5]">
        <ActivityIndicator size="large" color="#1A4D3E" />
        <Text className="mt-3 text-sm text-[#757575]">Loading dashboard...</Text>
      </View>
    );
  }

  const recentFarmers = data?.recent_farmers ?? [];
  const recentTasks = tasks?.recent ?? [];

  return (
    <ScrollView
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4"
      contentContainerStyle={scrollContentStyle}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loadError ? (
        <View className="mb-3 rounded-lg border border-[#EF4444] bg-[#FFEBEE] p-3">
          <Text className="text-sm font-semibold text-[#EF4444]">{loadError}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Pull down to retry.</Text>
        </View>
      ) : null}

      <View className="flex-row items-center gap-1.5">
        <User size={16} color="#757575" />
        <Text className="text-sm text-[#757575]">
          {user?.name ?? 'Field Agent'} (FA) · {user?.district ?? user?.region ?? 'Your area'}
        </Text>
      </View>

      <SectionHeading Icon={ChartColumn}>Your activity</SectionHeading>
      <View className="mb-4 gap-2">
        {activityKpiRows.rows.map((row, rowIndex) => (
          <View key={`activity-kpi-row-${rowIndex}`} className="flex-row gap-2">
            {row.map((kpi) => (
              <KpiMetricCard
                key={kpi.key}
                label={kpi.label}
                value={kpi.value}
                Icon={kpi.Icon}
                iconColor={kpi.iconColor}
                countColor={kpi.countColor}
                onPress={kpi.onPress}
              />
            ))}
            {row.length < activityKpiRows.columnsPerRow
              ? Array.from({ length: activityKpiRows.columnsPerRow - row.length }).map((_, i) => (
                  <View key={`activity-kpi-spacer-${rowIndex}-${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>

      {(data?.pending_photo_updates?.length ?? 0) > 0 ? (
        <KBCard style={{ marginBottom: 12 }}>
          <Text className="text-sm font-bold text-[#333333]">Profile photos to approve</Text>
          <Text className="mt-1 text-xs text-[#757575]">
            A farmer updated their picture. Open the profile, check the photo, then tap Approved.
          </Text>
          {data!.pending_photo_updates!.map((f) => (
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
              <Text className="text-xs font-semibold text-[#1A4D3E]">Review photo →</Text>
            </Pressable>
          ))}
        </KBCard>
      ) : null}

      <SectionHeading Icon={Calendar}>Task snapshots</SectionHeading>
      <View className="mb-4">
        <TaskStatusKpiRow
          counts={{
            overdue: tasks?.overdue_count ?? 0,
            in_progress: tasks?.in_progress_count ?? tasks?.upcoming_count ?? 0,
            not_started: tasks?.not_started_count ?? 0,
            submitted_for_approval: tasks?.submitted_for_approval_count ?? 0,
            rejected: tasks?.rejected_count ?? 0,
            completed: tasks?.completed_count ?? 0,
          }}
          selected={null}
          onSelect={(key) => goToTasks(key)}
        />
        <Pressable
          onPress={() => goToTasks('all')}
          className="items-center py-3"
          style={webPressable}
        >
          <Text className="text-sm font-semibold text-[#4472C4]">View all tasks →</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' })}
        style={webPressable}
      >
        <KBCard style={{ marginBottom: 12 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-[#333333]">
              My members ({farmers?.total ?? recentFarmers.length})
            </Text>
            <ChevronRight size={16} color="#1A4D3E" />
          </View>
          {recentFarmers.length > 0 ? (
            recentFarmers.map((f) => (
              <View key={f.farmer_id} className="mt-2 border-t border-[#EEE] pt-2">
                <Text className="text-sm font-semibold text-[#333333]">{f.name}</Text>
                <Text className="text-xs text-[#757575]">
                  {f.district ?? f.sub_county ?? '—'} · {f.status ?? 'pending'}
                </Text>
              </View>
            ))
          ) : (
            <Text className="mt-2 text-sm text-[#757575]">No members in your region yet.</Text>
          )}
        </KBCard>
      </Pressable>

      {recentTasks.length > 0 ? (
        <KBCard style={{ marginBottom: 12 }}>
          <Text className="text-sm font-bold text-[#333333]">Recent tasks</Text>
          {recentTasks.slice(0, 5).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => goToTasks('all', t.id)}
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

      {taskNotifications.length > 0 ? (
        <View className="mb-3 rounded-lg border border-[#C8E6C9] bg-[#E8F5E9] p-3">
          <Text className="mb-2 text-sm font-bold text-[#1A4D3E]">
            {taskNotifications.length} farmer task update
            {taskNotifications.length > 1 ? 's' : ''}
          </Text>
          {taskNotifications.map((notif) => (
            <TaskNotificationBanner
              key={notif.id}
              notification={notif}
              onPress={() => {
                dismissTaskNotification(notif.id);
                navigateFromNotification(navigation, {
                  id: notif.id,
                  type: notif.type,
                  context_type: notif.context_type ?? 'agent_task',
                  context_id: notif.context_id,
                }, { isAgent: true });
              }}
              onDismiss={() => dismissTaskNotification(notif.id)}
            />
          ))}
        </View>
      ) : null}

      <View className="mb-2 flex-row items-center gap-1.5">
        <Calendar size={16} color="#757575" />
        <Text className="text-sm font-bold uppercase tracking-wide text-[#757575]">Quick actions</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="outline"
          size="pill"
          onPress={() =>
            navigateNested(navigation, 'Tasks', { filter: 'all', openAdd: true })
          }
        >
          <Text className="font-semibold">+ Add task</Text>
        </Button>
        <Button
          variant="outline"
          size="pill"
          onPress={() => navigateNested(navigation, 'Farmers', { screen: 'FarmerList' })}
        >
          <Text className="font-semibold">View members</Text>
        </Button>
        <Button variant="outline" size="pill" onPress={() => navigateNested(navigation, 'Audit')}>
          <Text className="font-semibold">Activity log</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
