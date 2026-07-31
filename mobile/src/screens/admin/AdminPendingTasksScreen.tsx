import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { approveFarmerTask, getPendingFarmerTasks, rejectFarmerTask } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

interface PendingTask {
  id: string;
  name: string;
  farmer_name?: string;
  program_project_name?: string;
  payment_value_kes?: number;
  submitted_date?: string;
  notes?: string;
  photo_evidence_url?: string;
}

export function AdminPendingTasksScreen() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPendingFarmerTasks();
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
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

  const approve = async (id: string) => {
    setActing(id);
    try {
      await approveFarmerTask(id);
      await load();
      Alert.alert('Approved', 'Task approved — farmer will see payment pending.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason for the farmer.');
      return;
    }
    setActing(id);
    try {
      await rejectFarmerTask(id, rejectReason.trim());
      setRejectReason('');
      setExpandedId(null);
      await load();
      Alert.alert('Rejected', 'Farmer can resubmit after rework.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(null);
    }
  };

  if (loading && tasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <Text className="mb-3 text-[22px] font-bold text-[#1A4D3E]">Pending task approvals</Text>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="pb-8"
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <KBCard onPress={() => setExpandedId(expanded ? null : item.id)}>
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-base font-bold text-[#333333]">{item.name}</Text>
                <KBStatusChip label="Submitted" variant="pending" />
              </View>
              <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.program_project_name}</Text>
              <Text className="mt-1 text-[13px] text-[#757575]">KES {(item.payment_value_kes ?? 0).toLocaleString()}</Text>
              {expanded ? (
                <View className="mt-3 gap-2">
                  {item.notes ? <Text className="text-sm leading-5 text-[#333333]">Notes: {item.notes}</Text> : null}
                  {item.photo_evidence_url ? <Text className="text-sm leading-5 text-[#333333]">Photo: {item.photo_evidence_url}</Text> : null}
                  <View className="mt-2 gap-2">
                    <Button
                      className="mb-1 h-11 bg-[#2E7D5E]"
                      onPress={() => approve(item.id)}
                      disabled={acting === item.id}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="text-white">Approve</Text>
                      )}
                    </Button>
                    <TextInput
                      className="rounded-lg border border-[#E0E0E0] bg-white p-2.5"
                      placeholder="Rejection reason"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                    />
                    <Button
                      variant="outline"
                      className="h-11"
                      onPress={() => reject(item.id)}
                      disabled={acting === item.id}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#D32F2F" />
                      ) : (
                        <Text className="text-[#D32F2F]">Reject</Text>
                      )}
                    </Button>
                  </View>
                </View>
              ) : null}
            </KBCard>
          );
        }}
        ListEmptyComponent={<Text className="p-6 text-center text-[#757575]">No tasks awaiting approval.</Text>}
      />
    </View>
  );
}
