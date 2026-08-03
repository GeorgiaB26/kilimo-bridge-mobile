import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { FAB } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KilimoLogo } from '../../components/KilimoLogo';
import { FarmerLocationPrompt } from '../../components/FarmerLocationPrompt';
import { getFarmerDashboard, claimPayment, getFarmerPayments, getFarmerHierarchyProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerVerificationStatusCard } from '../../components/farmer/FarmerVerificationStatusCard';
import { useAuthStore } from '../../store/authStore';
import { getLocalizedGreeting, formatDueDate } from '../../utils/greeting';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';
import { showMessage } from '../../utils/feedback';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerTabParamList, FarmerProjectsStackParamList } from '../../navigation/types';
import { MessagesNotificationsHeaderIcons } from '../../components/messaging/MessagesNotificationsHeaderIcons';

type DashboardNav = CompositeNavigationProp<
  BottomTabNavigationProp<FarmerTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<FarmerProjectsStackParamList>
>;

export function FarmerDashboardScreen() {
  const navigation = useNavigation<DashboardNav>();
  const user = useAuthStore((s) => s.user);
  const { formatAmount, formatPayment } = useCurrency();
  const [data, setData] = useState<{
    farmer?: { name: string; country?: string; status?: string; profileLocationPending?: boolean };
    pendingAmount: number;
    totalEarnings: number;
    activeProjects: FarmerProject[];
    nextProject: FarmerProject | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getFarmerDashboard();
      setData(result);
      setError(null);
    } catch (err: unknown) {
      setData(null);
      setError(extractApiError(err, 'Backend offline or farmer account not linked'));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const payments = await getFarmerPayments();
      const pending = payments.payments?.find((p: { payment_status: string }) => p.payment_status === 'Pending');
      if (!pending) {
        showMessage('No payment ready', 'You have no payments ready to claim right now.');
        return;
      }
      const result = await claimPayment(pending.id);
      showMessage('Payment sent!', `${formatAmount(result.amount)} transferred.\nRef: ${result.reference}`);
      load();
    } catch {
      showMessage('Error', 'Could not claim payment. Is the backend running?');
    } finally {
      setClaiming(false);
    }
  };

  const country = data?.farmer?.country ?? 'Kenya';
  const greeting = getLocalizedGreeting(country, user?.name ?? 'Farmer');
  const pending = data?.pendingAmount ?? 0;
  const showLocationPrompt = Boolean(data?.farmer?.profileLocationPending);
  const farmerStatus = data?.farmer?.status;
  const showVerificationBanner =
    farmerStatus &&
    !['verified', 'inactive'].includes((farmerStatus ?? '').toLowerCase().replace(/\s+/g, '_'));

  const marginTopPayment = showVerificationBanner ? 'mt-2' : '-mt-6';

  const openProjectDetail = async (project: FarmerProject) => {
    try {
      const data = await getFarmerHierarchyProjects();
      const hierarchy = data.projects ?? [];
      if (hierarchy.length > 0) {
        const hp = hierarchy[0];
        navigation.navigate('Projects', {
          screen: 'HierarchyProjectDetail',
          params: { projectId: hp.id, projectName: hp.name },
        });
        return;
      }
    } catch {
      // fall through to legacy detail
    }
    let programProjectId: string | undefined;
    try {
      const data = await getFarmerHierarchyProjects();
      programProjectId = data.projects?.[0]?.id;
    } catch {
      // tasks section will resolve on its own
    }
    navigation.navigate('Projects', {
      screen: 'ProjectDetail',
      params: { project, programProjectId },
    });
  };

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF6A" />}
      >
        <View className="items-center rounded-b-3xl bg-[#1A4D3E] px-6 pb-8 pt-5">
          <View className="absolute right-4 top-4 z-10">
            <MessagesNotificationsHeaderIcons iconColor="#fff" />
          </View>
          <View className="mb-2.5 rounded-[10px] bg-white px-3.5 py-2.5">
            <KilimoLogo width={180} height={50} />
          </View>
          <Text className="mb-3.5 text-[15px] font-bold tracking-wide text-white/95">Kilimo Bridge Platform</Text>
          <Text className="text-center text-[26px] font-bold text-white">{greeting.primary}</Text>
          <Text className="mt-1 text-center text-[15px] text-white/90">{greeting.secondary}</Text>
          <Text className="mt-1.5 text-center text-sm text-white/75">Here&apos;s your earnings overview</Text>
        </View>

        {error ? <FarmerOfflineBanner message={error} /> : null}

        {showVerificationBanner ? (
          <View className="mx-4 mb-4 mt-2">
            <FarmerVerificationStatusCard status={farmerStatus} compact />
          </View>
        ) : null}

        <View className={`${marginTopPayment} mb-6 mx-4 items-center rounded-2xl bg-white p-6 shadow-sm elevation-4`}>
          <KBStatusChip label="Ready to Claim" variant="success" />
          <Text className="mt-3 text-sm text-[#757575]">Pending payment</Text>
          <Text className="my-2 text-4xl font-extrabold text-[#D4AF6A]">{formatAmount(pending)}</Text>
          <Button
            className="mt-2 h-12 w-full rounded-xl bg-[#D4AF6A]"
            onPress={handleClaim}
            disabled={claiming}
          >
            {claiming ? (
              <ActivityIndicator color="#1A4D3E" />
            ) : (
              <Text className="font-semibold text-[#1A4D3E]">
                {pending > 0 ? formatPayment(pending) : 'Claim Now'}
              </Text>
            )}
          </Button>
        </View>

        <View className="mb-5 px-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#1A4D3E]">Your Projects</Text>
            <Pressable onPress={onRefresh}>
              <Ionicons name="refresh" size={22} color="#1A4D3E" />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
            {(data?.activeProjects ?? []).map((p, i) => (
              <Pressable
                key={p.id ?? `${p.project_name}-${i}`}
                onPress={() => openProjectDetail(p)}
                className="mr-3 min-h-[176px] w-[228px] rounded-xl bg-white p-4 pb-5 shadow-sm elevation-2"
                accessibilityRole="button"
                accessibilityLabel={`View ${p.project_name} details`}
              >
                <View className="flex-row items-center justify-between">
                  <Ionicons name="leaf" size={24} color="#1A4D3E" />
                  <Ionicons name="chevron-forward" size={18} color="#757575" />
                </View>
                <Text className="mt-2 text-base font-semibold leading-[22px] text-[#333333]" numberOfLines={2}>{p.project_name}</Text>
                <Text className="mb-0.5 mt-1 text-lg font-bold text-[#D4AF6A]">{formatAmount(p.payment_amount)}</Text>
                <KBProgressBar
                  progress={p.completion_percentage}
                  label={`${p.completion_percentage}% done`}
                  rightLabel={p.due_date ? `Due ${formatDueDate(p.due_date)}` : undefined}
                  stacked
                />
              </Pressable>
            ))}
            {(data?.activeProjects ?? []).length === 0 ? (
              <Text className="p-4 text-[#757575]">No active projects yet</Text>
            ) : null}
          </ScrollView>
        </View>

        {data?.nextProject ? (
          <View className="mb-5 px-4">
            <Text className="mb-3 text-lg font-bold text-[#1A4D3E]">What&apos;s Next?</Text>
            <Pressable onPress={() => openProjectDetail(data.nextProject!)} accessibilityRole="button">
              <KBCard>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-[17px] font-semibold text-[#333333]">{data.nextProject.project_name}</Text>
                    <Text className="mt-1 text-[13px] text-[#757575]">
                      {data.nextProject.due_date
                        ? `Due: ${formatDueDate(data.nextProject.due_date)}`
                        : 'Tap for project details'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="#757575" />
                </View>
              </KBCard>
            </Pressable>
          </View>
        ) : null}

        <View className="mx-4 mb-20 flex-row justify-between rounded-xl bg-white p-5">
          <Text className="text-base text-[#333333]">Total earned</Text>
          <Text className="text-xl font-bold text-[#D4AF6A]">{formatAmount(data?.totalEarnings ?? 0)}</Text>
        </View>
      </ScrollView>

      {pending > 0 ? (
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
        visible={showLocationPrompt}
        onCompleted={load}
      />
    </View>
  );
}
