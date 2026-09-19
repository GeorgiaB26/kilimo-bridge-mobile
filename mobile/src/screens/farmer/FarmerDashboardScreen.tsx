import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { FarmerLocationPrompt } from '../../components/FarmerLocationPrompt';
import { getFarmerPayments, getFarmerHierarchyProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { FarmerVerificationStatusCard } from '../../components/farmer/FarmerVerificationStatusCard';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../context/CurrencyContext';
import { COLORS } from '../../constants';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerTabParamList, FarmerProjectsStackParamList } from '../../navigation/types';
import {
  FarmerDashboardProfileCard,
  FarmerDashboardEarningsCard,
  FarmerDashboardTaskSnapshots,
  FarmerDashboardRecentTasks,
  FarmerDashboardRecentProjects,
  FarmerDashboardRecentPayments,
  FarmerDashboardSupportSection,
} from '../../components/farmer/FarmerDashboardSections';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { fetchFarmerDashboardForCache } from '../../services/readCacheFetchers';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { openFarmerTaskModule } from '../../utils/farmerNotificationNavigation';
import { useTabScreenContentContainerStyle } from '../../navigation/FloatingTabBar';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<FarmerTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<FarmerProjectsStackParamList>
>;

type PaymentRow = {
  id: string;
  project_name?: string;
  task_name?: string;
  amount: number;
  payment_status: string;
  created_at?: string;
};

type DashboardData = {
  farmer?: {
    name: string;
    country?: string;
    district?: string;
    region?: string;
    status?: string;
    profileLocationPending?: boolean;
    picture_url?: string | null;
    pending_picture_url?: string | null;
    photoUpdatePending?: boolean;
  };
  pendingAmount: number;
  totalEarnings: number;
  activeProjects: FarmerProject[];
  nextProject: FarmerProject | null;
  paymentSummary?: {
    transferred: number;
    pending: number;
    expected: number;
    total: number;
    completed?: number;
    allPayments?: number;
  };
  taskStats?: {
    overdue: number;
    in_progress?: number;
    not_started?: number;
    submitted_for_approval?: number;
    rejected?: number;
    completed?: number;
    total?: number;
  };
  recentTasks?: Array<{
    id: string;
    name: string;
    due_date?: string | null;
    assigned_by_name?: string;
    program_project_name?: string;
    status?: string;
  }>;
  assignedTaskCount?: number;
};

export function FarmerDashboardScreen() {
  const navigation = useNavigation<DashboardNav>();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { formatAmount, currencyInfo } = useCurrency();
  const userScope = useReadCacheUserScope();
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerDashboard,
        userScope,
        fetchLive: fetchFarmerDashboardForCache,
      });
      setData(result.data as DashboardData);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);

      try {
        const paymentsData = await getFarmerPayments();
        setRecentPayments((paymentsData.payments ?? []) as PaymentRow[]);
      } catch {
        setRecentPayments([]);
      }

      setError(null);
    } catch (err: unknown) {
      setData(null);
      setRecentPayments([]);
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Backend offline or farmer account not linked'));
    } finally {
      setLoading(false);
    }
  }, [userScope]);

  React.useEffect(() => {
    load();
  }, [load]);

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

  const country = data?.farmer?.country ?? 'Kenya';
  const showLocationPrompt = Boolean(data?.farmer?.profileLocationPending);
  const farmerStatus = data?.farmer?.status;
  const showVerificationBanner =
    farmerStatus &&
    !['verified', 'inactive'].includes((farmerStatus ?? '').toLowerCase().replace(/\s+/g, '_'));

  const openProjectDetail = async (project: FarmerProject) => {
    try {
      const hierarchyData = await getFarmerHierarchyProjects();
      const hierarchy = hierarchyData.projects ?? [];
      if (hierarchy.length > 0) {
        const hp = hierarchy.find((p: { id: string }) => p.id === project.id) ?? hierarchy[0];
        navigation.navigate('Projects', {
          screen: 'HierarchyProjectDetail',
          params: { projectId: hp.id, projectName: hp.name },
        });
        return;
      }
    } catch {
      // fall through
    }
    let programProjectId: string | undefined;
    try {
      const hierarchyData = await getFarmerHierarchyProjects();
      programProjectId = hierarchyData.projects?.[0]?.id;
    } catch {
      // tasks section will resolve on its own
    }
    navigation.navigate('Projects', {
      screen: 'ProjectDetail',
      params: { project, programProjectId },
    });
  };

  const goToProfile = () => navigation.navigate('Profile');
  const goToPayments = () => navigation.navigate('Payments');
  const goToTasks = (
    statusFilter?:
      | 'overdue'
      | 'in_progress'
      | 'not_started'
      | 'submitted_for_approval'
      | 'rejected'
      | 'completed'
  ) => {
    if (!statusFilter) {
      navigation.navigate('Tasks');
      return;
    }
    navigation.navigate('Tasks', { statusFilter });
  };

  const openTask = (taskId: string) => {
    openFarmerTaskModule(navigation, taskId);
  };

  const scrollContentStyle = useTabScreenContentContainerStyle({ paddingBottom: 16 });

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F5F5F5]">
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text className="mt-3 text-sm text-[#757575]">Loading your home...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={scrollContentStyle}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF6A" />
        }
      >
        {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
        {error && !data ? <FarmerOfflineBanner message={error} /> : null}

        {showVerificationBanner ? (
          <View className="mx-3 mb-2 mt-2">
            <FarmerVerificationStatusCard status={farmerStatus} compact />
          </View>
        ) : null}

        <FarmerDashboardProfileCard
          farmer={data?.farmer}
          currencyLabel={`${currencyInfo.name} (${currencyInfo.code})`}
          onEditProfile={goToProfile}
          onLogout={() => logout()}
        />

        <FarmerDashboardEarningsCard
          paymentSummary={data?.paymentSummary}
          formatAmount={formatAmount}
          onPress={goToPayments}
        />

        <FarmerDashboardTaskSnapshots
          taskStats={data?.taskStats}
          onTasksPress={(filter) => goToTasks(filter)}
        />

        <FarmerDashboardRecentTasks
          tasks={data?.recentTasks}
          onTasksPress={() => goToTasks()}
          onTaskPress={(taskId) => openTask(taskId)}
        />

        <FarmerDashboardRecentProjects
          projects={data?.activeProjects ?? []}
          formatAmount={formatAmount}
          onProjectPress={openProjectDetail}
          onProjectsPress={() =>
            navigation.navigate('Projects', { screen: 'ProjectsList' })
          }
        />

        <View style={{ paddingHorizontal: 12, marginVertical: 12 }}>
          <Text className="mb-3 text-base font-bold text-[#1F4E78]">Recent Payments</Text>
          <FarmerDashboardRecentPayments
            payments={recentPayments}
            formatAmount={formatAmount}
            onPress={goToPayments}
          />
        </View>

        <FarmerDashboardSupportSection
          farmerName={data?.farmer?.name}
          farmerPhone={user?.phoneNumber}
        />
      </ScrollView>

      <FarmerLocationPrompt
        country={country}
        visible={showLocationPrompt && !cacheFetchedAt}
        onCompleted={load}
      />
    </View>
  );
}
