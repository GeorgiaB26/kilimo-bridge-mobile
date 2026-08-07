import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getFarmers, getProgramProject } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { OutboxProjectAssignCard } from '../../components/OutboxProjectAssignCard';
import type { AdminProgramsStackParamList } from '../../navigation/types';
import {
  dismissProjectAssignOutbox,
  listPendingProjectAssigns,
  pushPendingProjectAssign,
  submitProjectAssignWithOutbox,
  syncAllPendingProjectAssigns,
  type PendingProjectAssignView,
} from '../../services/submitProjectAssignOutbox';
import { sortedFarmerIds } from '../../services/offlineOutboxHandlers';

type Route = RouteProp<AdminProgramsStackParamList, 'ProgramProjectDetail'>;

export function AdminProgramProjectDetailScreen() {
  const route = useRoute<Route>();
  const { projectId } = route.params;
  const [project, setProject] = useState<{
    name: string;
    program_name?: string;
    region?: string;
    farmers_count?: number;
    tasks?: Array<{ id: string; name: string; task_order: number; payment_value_kes: number }>;
    farmers?: Array<{ farmer_id: string; name: string; status: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pendingAssigns, setPendingAssigns] = useState<PendingProjectAssignView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const all = await listPendingProjectAssigns();
    setPendingAssigns(all.filter((p) => p.projectId === projectId));
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const data = await getProgramProject(projectId);
      setProject(data);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await syncAllPendingProjectAssigns();
        await Promise.all([load(), loadPending()]);
      })();
    }, [load, loadPending])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAllPendingProjectAssigns();
    await Promise.all([load(), loadPending()]);
    setRefreshing(false);
  };

  const assignDemoFarmers = async () => {
    if (!project) return;
    setAssigning(true);
    try {
      const data = await getFarmers(10, 0);
      const ids = (data.farmers ?? []).map((f: { farmer_id: string }) => f.farmer_id);
      if (ids.length === 0) {
        Alert.alert('No farmers', 'Import or register farmers first.');
        return;
      }
      const expectedFarmerIds = sortedFarmerIds(
        (project.farmers ?? []).map((f) => f.farmer_id)
      );
      const result = await submitProjectAssignWithOutbox({
        projectId,
        projectName: project.name,
        farmerIds: ids,
        expectedFarmerIds,
      });
      await loadPending();
      if (result.mode === 'online') {
        await load();
        Alert.alert('Assigned', `${ids.length} farmers assigned to this project.`);
        return;
      }
      if (result.mode === 'offline') {
        Alert.alert(
          'Saved offline',
          'Farmer assignment queued. It will sync when you are back online.'
        );
        return;
      }
      Alert.alert('Needs your review', result.error);
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not assign farmers'));
    } finally {
      setAssigning(false);
    }
  };

  const handlePush = async (item: PendingProjectAssignView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingProjectAssign(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.farmerIds.length} farmers assigned to ${item.projectName}.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync');
      }
    } finally {
      setPushingId(null);
    }
  };

  if (loading && !project) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#F5F5F5] p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-[22px] font-bold text-[#1A4D3E]">{project?.name}</Text>
      <Text className="mt-1 text-sm text-[#757575]">{project?.program_name} · {project?.region ?? '—'}</Text>
      <Text className="mt-1 text-sm text-[#757575]">{project?.farmers_count ?? 0} farmers enrolled</Text>

      {pendingAssigns.length > 0 ? (
        <View className="mt-4">
          <Text className="mb-2 text-base font-bold text-[#333333]">Queued assignments</Text>
          {pendingAssigns.map((item) => (
            <OutboxProjectAssignCard
              key={item.id}
              item={item}
              pushing={pushingId === item.id}
              onPush={() => handlePush(item)}
              onDismiss={() => dismissProjectAssignOutbox(item.id).then(loadPending)}
            />
          ))}
        </View>
      ) : null}

      <Button
        className="my-4 h-11 bg-[#1A4D3E]"
        onPress={assignDemoFarmers}
        disabled={assigning || pendingAssigns.length > 0}
      >
        {assigning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white">Assign first 10 farmers</Text>
        )}
      </Button>

      <Text className="mb-2 mt-4 text-base font-bold text-[#333333]">Tasks (sequence)</Text>
      {(project?.tasks ?? []).map((t) => (
        <KBCard key={t.id} elevated={false}>
          <Text className="text-xs font-semibold text-[#757575]">Step {t.task_order}</Text>
          <Text className="mt-0.5 text-base font-semibold text-[#333333]">{t.name}</Text>
          <Text className="mt-1 text-sm font-bold text-[#D4AF6A]">KES {t.payment_value_kes?.toLocaleString()}</Text>
        </KBCard>
      ))}

      <Text className="mb-2 mt-4 text-base font-bold text-[#333333]">Enrolled farmers</Text>
      {(project?.farmers ?? []).length === 0 ? (
        <Text className="mb-6 text-[#757575]">No farmers assigned yet.</Text>
      ) : (
        (project?.farmers ?? []).map((f) => (
          <KBCard key={f.farmer_id} elevated={false}>
            <View className="flex-row items-center justify-between">
              <Text className="text-[15px] font-semibold text-[#333333]">{f.name}</Text>
              <KBStatusChip label={f.status} variant="info" />
            </View>
          </KBCard>
        ))
      )}
    </ScrollView>
  );
}
