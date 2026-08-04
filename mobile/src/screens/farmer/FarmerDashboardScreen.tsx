import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { FarmerLocationPrompt } from '../../components/FarmerLocationPrompt';
import {
  getFarmerDashboard,
  getFarmerPayments,
  getFarmerHierarchyProjects,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { FarmerVerificationStatusCard } from '../../components/farmer/FarmerVerificationStatusCard';
import { useAuthStore } from '../../store/authStore';
import { useCurrency } from '../../context/CurrencyContext';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerTabParamList, FarmerProjectsStackParamList } from '../../navigation/types';
import { MessagesNotificationsHeaderIcons } from '../../components/messaging/MessagesNotificationsHeaderIcons';
import {
  FarmerDashboardProfileCard,
  FarmerDashboardEarningsCard,
  FarmerDashboardTaskSnapshots,
  FarmerDashboardRecentProjects,
  FarmerDashboardRecentPayments,
  FarmerDashboardSupportSection,
} from '../../components/farmer/FarmerDashboardSections';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<FarmerTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<FarmerProjectsStackParamList>
>;

type PaymentRow = {
  id: string;
  project_name?: string;
  amount: number;
  payment_status: string;
  created_at?: string;
};

export function FarmerDashboardScreen() {
  const navigation = useNavigation<DashboardNav>();
  const logout = useAuthStore((s) => s.logout);
  const { formatAmount, currencyInfo } = useCurrency();
  const user = useAuthStore((s) => s.user);
  const userScope = useReadCacheUserScope();
  const { formatAmount, formatClaim } = useCurrency();
  const [data, setData] = useState<{
    farmer?: {
      name: string;
      country?: string;
      district?: string;
      region?: string;
      status?: string;
      profileLocationPending?: boolean;
      picture_url?: string | null;
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
    taskStats?: { overdue: number; upcoming: number };
  } | null>(null);
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getFarmerDashboard();
      setData(result);
      const paymentsData = await getFarmerPayments();
      setRecentPayments((paymentsData.payments ?? []) as PaymentRow[]);
      setError(null);
    } catch (err: unknown) {
      setData(null);
      setRecentPayments([]);
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerDashboard,
        userScope,
        fetchLive: () => getFarmerDashboard(),
      });
      setData(result.data);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      setError(null);
    } catch (err: unknown) {
      setData(null);
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Backend offline or farmer account not linked'));
    }
  }, [userScope]);

  React.useEffect(() => {
    load();
  }, [load]);

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
  const goToTasks = (statusFilter?: 'overdue' | 'upcoming') => {
    navigation.navigate('Tasks', statusFilter ? { statusFilter } : undefined);
  };

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF6A" />
        }
      >
        <View className="bg-white px-4 pb-3 pt-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[28px] font-bold text-[#1F4E78]">Dashboard</Text>
            <MessagesNotificationsHeaderIcons iconColor="#1A4D3E" />
          </View>
        </View>

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
        <View className={`${marginTopPayment} mb-6 mx-4 items-center rounded-2xl bg-white p-6 shadow-sm elevation-4`}>
          <KBStatusChip label="Ready to Claim" variant="success" />
          <Text className="mt-3 text-sm text-[#757575]">Earnings to claim</Text>
          <Text className="my-2 text-4xl font-extrabold text-[#D4AF6A]">{formatAmount(pending)}</Text>
          <Button
            className="mt-2 h-12 w-full rounded-xl bg-[#D4AF6A]"
            onPress={handleClaim}
            disabled={claiming || !!cacheFetchedAt}
          >
            {claiming ? (
              <ActivityIndicator color="#1A4D3E" />
            ) : (
              <Text className="font-semibold text-[#1A4D3E]">
                {pending > 0 ? formatClaim(pending) : 'Claim now'}
              </Text>
            )}
          </Button>
        </View>

        <FarmerDashboardEarningsCard
          paymentSummary={data?.paymentSummary}
          formatAmount={formatAmount}
          onPress={goToPayments}
        />

        <FarmerDashboardTaskSnapshots
          taskStats={data?.taskStats}
          onTasksPress={goToTasks}
        />

        <View style={{ paddingHorizontal: 12, marginVertical: 12 }}>
          <Text className="mb-3 text-base font-bold text-[#1F4E78]">Recent Projects</Text>
          <FarmerDashboardRecentProjects
            projects={data?.activeProjects ?? []}
            formatAmount={formatAmount}
            onProjectPress={openProjectDetail}
          />
        </View>

        <View style={{ paddingHorizontal: 12, marginVertical: 12 }}>
          <Text className="mb-3 text-base font-bold text-[#1F4E78]">Recent Payments</Text>
          <FarmerDashboardRecentPayments
            payments={recentPayments}
            formatAmount={formatAmount}
            onPress={goToPayments}
          />
        </View>

        <FarmerDashboardSupportSection />
      </ScrollView>

      {pending > 0 && !cacheFetchedAt ? (
        <FAB
          icon="cash"
          label="Claim"
          style={{ position: 'absolute', right: 16, bottom: 16, backgroundColor: '#D4AF6A' }}
          color="#1A4D3E"
          onPress={handleClaim}
          loading={claiming}
        />
      ) : null}
      <FarmerLocationPrompt
        country={country}
        visible={showLocationPrompt && !cacheFetchedAt}
        onCompleted={load}
      />
    </View>
  );
}
