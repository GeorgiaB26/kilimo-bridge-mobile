import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  approveFarmerTask,
  getAgentHelpRequests,
  getPendingFarmerTasks,
  rejectFarmerTask,
  resolveAgentHelpRequest,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

interface HelpRequest {
  id: string;
  message: string;
  farmer_name?: string;
  farmer_phone?: string;
  created_at?: string;
}

interface PendingTask {
  id: string;
  name: string;
  farmer_name?: string;
  program_project_name?: string;
  payment_value_kes?: number;
  notes?: string;
  photo_evidence_url?: string;
}

function formatWhen(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function AgentPendingTasksScreen() {
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [helpData, taskData] = await Promise.all([
        getAgentHelpRequests(),
        getPendingFarmerTasks(),
      ]);
      setHelpRequests(helpData.requests ?? []);
      setTasks(taskData.tasks ?? []);
    } catch {
      setHelpRequests([]);
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

  const markContacted = async (id: string) => {
    setActing(id);
    try {
      await resolveAgentHelpRequest(id);
      await load();
      Alert.alert('Done', 'Marked as contacted — farmer will be notified.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not update request'));
    } finally {
      setActing(null);
    }
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  const empty = helpRequests.length === 0 && tasks.length === 0;

  return (
    <ScrollView
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="mb-3 text-[22px] font-bold text-[#1A4D3E]">Tasks</Text>

      {empty ? (
        <View className="items-center rounded-xl bg-white p-6">
          <Ionicons name="checkmark-circle-outline" size={48} color="#2E7D5E" />
          <Text className="mt-3 text-center text-[#757575]">
            No open farmer help requests or pending task approvals.
          </Text>
        </View>
      ) : null}

      {helpRequests.length > 0 ? (
        <View className="mb-6">
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
            Farmer help requests
          </Text>
          {helpRequests.map((item) => (
            <View key={item.id} className="mb-3">
            <KBCard>
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-base font-bold text-[#333333]">Contact farmer</Text>
                <KBStatusChip label="Help" variant="pending" />
              </View>
              <Text className="mt-1 text-[13px] text-[#757575]">
                {item.farmer_name} · {item.farmer_phone}
              </Text>
              {item.created_at ? (
                <Text className="mt-0.5 text-[12px] text-[#757575]">{formatWhen(item.created_at)}</Text>
              ) : null}
              <Text className="mt-2 text-sm leading-5 text-[#333333]">{item.message}</Text>
              <Button
                size="pill"
                className="mt-3 bg-[#1A4D3E]"
                onPress={() => markContacted(item.id)}
                disabled={acting === item.id}
              >
                {acting === item.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-semibold text-white">Mark contacted</Text>
                )}
              </Button>
            </KBCard>
            </View>
          ))}
        </View>
      ) : null}

      {tasks.length > 0 ? (
        <View>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
            Task approvals
          </Text>
          {tasks.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <View key={item.id} className="mb-3">
              <KBCard onPress={() => setExpandedId(expanded ? null : item.id)}>
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-base font-bold text-[#333333]">{item.name}</Text>
                  <KBStatusChip label="Submitted" variant="pending" />
                </View>
                <Text className="mt-1 text-[13px] text-[#757575]">
                  {item.farmer_name} · {item.program_project_name}
                </Text>
                <Text className="mt-1 text-[13px] text-[#757575]">
                  KES {(item.payment_value_kes ?? 0).toLocaleString()}
                </Text>
                {expanded ? (
                  <View className="mt-3 gap-2">
                    {item.notes ? (
                      <Text className="text-sm leading-5 text-[#333333]">Notes: {item.notes}</Text>
                    ) : null}
                    {item.photo_evidence_url ? (
                      <Text className="text-sm leading-5 text-[#333333]">Photo attached</Text>
                    ) : null}
                    <Button
                      size="pill"
                      className="mb-1 bg-[#2E7D5E]"
                      onPress={() => approve(item.id)}
                      disabled={acting === item.id}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="font-semibold text-white">Approve</Text>
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
                      size="pill"
                      className="border-[#D32F2F]"
                      onPress={() => reject(item.id)}
                      disabled={acting === item.id}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#D32F2F" />
                      ) : (
                        <Text className="font-semibold text-[#D32F2F]">Reject</Text>
                      )}
                    </Button>
                  </View>
                ) : null}
              </KBCard>
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}
