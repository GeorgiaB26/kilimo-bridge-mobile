import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getPendingFarmerTasks } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { OutboxTaskApprovalCard } from '../../components/OutboxTaskApprovalCard';
import {
  dismissTaskApprovalOutbox,
  listPendingTaskApprovals,
  pushPendingTaskApproval,
  submitTaskDecisionWithOutbox,
  syncAllPendingTaskApprovals,
  type PendingTaskApprovalView,
} from '../../services/submitTaskApprovalOutbox';

interface PendingTask {
  id: string;
  name: string;
  farmer_name?: string;
  program_project_name?: string;
  payment_value_kes?: number;
  submitted_date?: string;
  notes?: string;
  photo_evidence_url?: string;
  status?: string;
}

export function AdminPendingTasksScreen() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingTaskApprovalView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setPendingApprovals(await listPendingTaskApprovals());
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await syncAllPendingTaskApprovals();
        await Promise.all([load(), loadPending()]);
      })();
    }, [load, loadPending])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAllPendingTaskApprovals();
    await Promise.all([load(), loadPending()]);
    setRefreshing(false);
  };

  const handleDecisionResult = async (
    result: Awaited<ReturnType<typeof submitTaskDecisionWithOutbox>>,
    decision: 'approve' | 'reject'
  ) => {
    await loadPending();
    if (result.mode === 'online') {
      setRejectReason('');
      setExpandedId(null);
      await load();
      Alert.alert(
        decision === 'approve' ? 'Approved' : 'Rejected',
        decision === 'approve'
          ? 'Task approved — farmer will see payment pending.'
          : 'Farmer can resubmit after rework.'
      );
      return;
    }
    if (result.mode === 'offline') {
      setRejectReason('');
      setExpandedId(null);
      Alert.alert(
        'Saved offline',
        `${decision === 'approve' ? 'Approval' : 'Rejection'} queued for sync.`
      );
      return;
    }
    Alert.alert('Needs your review', result.error);
  };

  const approve = async (item: PendingTask) => {
    setActing(item.id);
    try {
      const result = await submitTaskDecisionWithOutbox({
        farmerTaskId: item.id,
        taskName: item.name,
        decision: 'approve',
        expectedStatus: item.status || 'submitted-for-approval',
      });
      await handleDecisionResult(result, 'approve');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(null);
    }
  };

  const reject = async (item: PendingTask) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason for the farmer.');
      return;
    }
    setActing(item.id);
    try {
      const result = await submitTaskDecisionWithOutbox({
        farmerTaskId: item.id,
        taskName: item.name,
        decision: 'reject',
        expectedStatus: item.status || 'submitted-for-approval',
        rejectionReason: rejectReason.trim(),
      });
      await handleDecisionResult(result, 'reject');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(null);
    }
  };

  const handlePush = async (item: PendingTaskApprovalView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingTaskApproval(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.taskName} updated.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync');
      }
    } finally {
      setPushingId(null);
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
        ListHeaderComponent={
          pendingApprovals.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-[17px] font-bold text-[#333333]">Queued decisions</Text>
              {pendingApprovals.map((item) => (
                <OutboxTaskApprovalCard
                  key={item.id}
                  item={item}
                  pushing={pushingId === item.id}
                  onPush={() => handlePush(item)}
                  onDismiss={() => dismissTaskApprovalOutbox(item.id).then(loadPending)}
                />
              ))}
            </View>
          ) : null
        }
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
                      onPress={() => approve(item)}
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
                      onPress={() => reject(item)}
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
