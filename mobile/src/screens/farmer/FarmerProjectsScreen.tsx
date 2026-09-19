import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getFarmerProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';
import { formatProjectStatus, formatDisplayDate, formatProjectDate } from '../../utils/greeting';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerProjectsStackParamList } from '../../navigation/types';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { fetchFarmerProjectsForCache } from '../../services/readCacheFetchers';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { useTabScreenContentContainerStyle } from '../../navigation/FloatingTabBar';

type Tab = 'active' | 'completed';
type Nav = NativeStackNavigationProp<FarmerProjectsStackParamList, 'ProjectsList'>;

interface HierarchyProject {
  id: string;
  name: string;
  program_name?: string;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  assigned_task_count?: number;
  task_count?: number;
  completed_task_count?: number;
}

export function FarmerProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const { formatAmount } = useCurrency();
  const userScope = useReadCacheUserScope();
  const scrollContentStyle = useTabScreenContentContainerStyle();
  const [tab, setTab] = useState<Tab>('active');
  const [projects, setProjects] = useState<FarmerProject[]>([]);
  const [hierarchyProjects, setHierarchyProjects] = useState<HierarchyProject[]>([]);
  const [useHierarchy, setUseHierarchy] = useState(false);

  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);

  const loadHierarchy = useCallback(() => {
    loadWithReadCache({
      cacheKey: READ_CACHE_KEYS.farmerProjects,
      userScope,
      fetchLive: fetchFarmerProjectsForCache,
    })
      .then((result) => {
        const list = result.data.projects ?? [];
        setHierarchyProjects(list);
        setUseHierarchy(true);
        setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
        if (result.fromCache) {
          setHierarchyError(null);
        } else {
          setHierarchyError(
            list.length === 0
              ? 'No program projects assigned. Restart backend to load demo data.'
              : null
          );
        }
      })
      .catch((err: unknown) => {
        setHierarchyProjects([]);
        setUseHierarchy(true);
        setCacheFetchedAt(null);
        setHierarchyError(extractApiError(err, 'Could not load program projects'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userScope]);

  useEffect(() => {
    loadHierarchy();
    getFarmerProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {});
  }, [loadHierarchy]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F5F5F5]">
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text className="mt-3 text-sm text-[#757575]">Loading your projects...</Text>
      </View>
    );
  }

  if (useHierarchy) {
    const active = hierarchyProjects.filter((p) => p.status !== 'completed');
    const done = hierarchyProjects.filter((p) => p.status === 'completed');
    const shown = tab === 'active' ? active : done;

    return (
      <View className="flex-1 bg-[#F5F5F5]">
        <View className="flex-1 p-4">
        <Text className="mb-4 text-sm leading-5 text-[#757575]">
          Tap a project to see your assigned tasks and mark them complete
        </Text>
        {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
        {hierarchyError && hierarchyProjects.length === 0 ? (
          <FarmerOfflineBanner message={hierarchyError} hint="Restart backend, then log out and use Farmer quick login (+254712345678)." />
        ) : null}
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          buttons={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ]}
          style={{ marginBottom: 16 }}
        />
        <FlatList
          className="flex-1"
          data={shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={scrollContentStyle}
          renderItem={({ item }) => {
            const total = Number(item.assigned_task_count ?? item.task_count) || 0;
            const doneCount = Number(item.completed_task_count) || 0;
            const progress = total > 0 ? Math.round((100 * doneCount) / total) : 0;
            return (
              <KBCard onPress={() => navigation.navigate('HierarchyProjectDetail', { projectId: item.id, projectName: item.name })}>
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-lg font-bold text-[#333333]">{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#757575" />
                </View>
                <Text className="mb-2 mt-1 text-[13px] text-[#757575]">{item.program_name}</Text>
                {(item.start_date || item.end_date) ? (
                  <Text className="mb-2 text-[12px] text-[#757575]">
                    {item.start_date ? `Start: ${formatProjectDate(item.start_date)}` : ''}
                    {item.start_date && item.end_date ? ' · ' : ''}
                    {item.end_date ? `End: ${formatProjectDate(item.end_date)}` : ''}
                  </Text>
                ) : null}
                <KBProgressBar
                  progress={progress}
                  label={total > 0 ? `${doneCount}/${total} tasks` : 'No tasks assigned yet'}
                  stacked
                />
              </KBCard>
            );
          }}
          ListEmptyComponent={<Text className="text-center text-sm leading-5 text-[#757575]">No program projects assigned yet.</Text>}
        />
        </View>
      </View>
    );
  }

  const filtered = projects.filter((p) =>
    tab === 'active' ? p.status !== 'Completed' : p.status === 'Completed'
  );

  const openDetail = (project: FarmerProject) => {
    navigation.navigate('ProjectDetail', { project });
  };

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <View className="flex-1 p-4">
      <Text className="mb-4 text-sm leading-5 text-[#757575]">
        {tab === 'active'
          ? 'Training and work you are currently doing'
          : 'Projects you have finished and been paid for'}
      </Text>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'active', label: 'Ongoing' },
          { value: 'completed', label: 'Finished' },
        ]}
        style={{ marginBottom: 16 }}
        density="medium"
      />
      <FlatList
        className="flex-1"
        data={filtered}
        keyExtractor={(item, i) => item.id ?? `${item.project_name}-${i}`}
        contentContainerStyle={scrollContentStyle}
        renderItem={({ item }) => {
          const statusInfo = formatProjectStatus(item.status ?? '');
          const isComplete = item.status === 'Completed';
          const progress = Number(item.completion_percentage) || 0;
          const amount = Number(item.payment_amount) || 0;
          return (
            <KBCard onPress={() => openDetail(item)}>
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-lg font-bold text-[#333333]">{item.project_name}</Text>
                <View className="flex-row items-center gap-1">
                  <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
                  <Ionicons name="chevron-forward" size={20} color="#757575" style={{ marginLeft: 4 }} />
                </View>
              </View>
              <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#757575]">Payment amount</Text>
              <Text className="mb-2 mt-0.5 text-2xl font-extrabold text-[#D4AF6A]">{formatAmount(amount)}</Text>
              {!isComplete ? (
                <KBProgressBar
                  progress={progress}
                  label={`${progress}% done`}
                  rightLabel={item.due_date ? `Due ${formatDisplayDate(item.due_date)}` : undefined}
                  stacked
                />
              ) : (
                <Text className="mt-3 text-sm font-medium leading-[22px] text-[#2E7D5E]">Payment transferred to your M-Pesa</Text>
              )}
            </KBCard>
          );
        }}
        ListEmptyComponent={
          <View className="items-center p-6">
            <Text className="mb-2 text-base font-semibold text-[#333333]">
              {tab === 'active' ? 'No ongoing projects' : 'No finished projects yet'}
            </Text>
            <Text className="text-center text-sm leading-5 text-[#757575]">
              {tab === 'active'
                ? 'When your cooperative assigns you work, it will appear here.'
                : 'Completed projects and payments will show here.'}
            </Text>
          </View>
        }
      />
      </View>
    </View>
  );
}
