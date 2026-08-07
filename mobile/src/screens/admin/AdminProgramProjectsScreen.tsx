import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { getProgramProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import type { AdminProgramsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AdminProgramsStackParamList, 'ProgramProjectsList'>;

interface ProgramProjectRow {
  id: string;
  name: string;
  program_name?: string;
  region?: string;
  status: string;
  farmers_count?: number;
  total_tasks?: number;
  progress_percent?: number;
}

export function AdminProgramProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const [projects, setProjects] = useState<ProgramProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getProgramProjects();
      setProjects(data.projects ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Could not load program projects'));
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

  if (loading && projects.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <View className="mb-3">
        <Text className="mb-2 text-[26px] font-bold text-[#1A4D3E]">Program Projects</Text>
        <KBCard onPress={() => navigation.navigate('PendingTasks')} style={{ marginBottom: 0 }} elevated={false}>
          <View className="flex-row items-center gap-2">
            <Ionicons name="checkmark-circle-outline" size={18} color="#1A4D3E" />
            <Text className="font-semibold text-[#1A4D3E]">Pending approvals</Text>
          </View>
        </KBCard>
      </View>

      {error ? <Text className="mb-2 text-[#D32F2F]">{error}</Text> : null}

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="pb-8"
        renderItem={({ item }) => (
          <KBCard onPress={() => navigation.navigate('ProgramProjectDetail', { projectId: item.id, name: item.name })}>
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-lg font-bold text-[#333333]">{item.name}</Text>
              <KBStatusChip label={item.status} variant={item.status === 'active' ? 'success' : 'info'} />
            </View>
            <Text className="mt-1 text-[13px] text-[#757575]">{item.program_name} · {item.region ?? '—'}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{item.farmers_count ?? 0} farmers · {item.total_tasks ?? 0} tasks</Text>
            <KBProgressBar progress={Number(item.progress_percent) || 0} label="Progress" stacked />
          </KBCard>
        )}
        ListEmptyComponent={
          <Text className="p-6 text-center leading-[22px] text-[#757575]">
            No program projects yet. Run seed:hierarchy on the backend to create demo data.
          </Text>
        }
      />
    </View>
  );
}
