import React, { useState, useCallback, useMemo } from 'react';
import {
  View, FlatList, SectionList, RefreshControl, ActivityIndicator,
  Modal, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { X } from 'lucide-react-native';
import { Menu, Button as PaperButton } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  getAdminFarmerTasks,
  getProgramProjects,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { OutboxTaskApprovalCard } from '../../components/OutboxTaskApprovalCard';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import {
  getReadCache,
  loadWithReadCache,
  READ_CACHE_KEYS,
} from '../../services/offlineReadCache';
import { categorizeTasks } from '../../utils/taskCategorization';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import {
  dismissTaskApprovalOutbox,
  listPendingTaskApprovals,
  pushPendingTaskApproval,
  submitTaskDecisionWithOutbox,
  syncAllPendingTaskApprovals,
  type PendingTaskApprovalView,
} from '../../services/submitTaskApprovalOutbox';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'submitted-for-approval', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
];

interface TaskRow {
  id: string;
  name: string;
  farmer_name?: string;
  farmer_phone?: string;
  program_project_name?: string;
  program_project_id?: string;
  status: string;
  payment_value_kes?: number;
  due_date?: string;
  notes?: string;
  photo_evidence_url?: string;
  submitted_date?: string;
  approved_date?: string;
  rejection_reason?: string;
  description?: string;
}

type TasksCachePayload = {
  tasks: TaskRow[];
  projects: Array<{ id: string; name: string }>;
};

function filterTasks(
  tasks: TaskRow[],
  opts: { projectId?: string; status?: string }
): TaskRow[] {
  let list = tasks;
  if (opts.projectId) {
    list = list.filter((t) => t.program_project_id === opts.projectId);
  }
  if (opts.status) {
    list = list.filter((t) => t.status === opts.status);
  }
  return list;
}

export function AdminTasksScreen() {
  const userScope = useReadCacheUserScope();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingTaskApprovalView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setPendingApprovals(await listPendingTaskApprovals());
  }, []);

  const load = useCallback(async () => {
    const hasFilter = Boolean(projectFilter || statusFilter);
    try {
      if (hasFilter) {
        try {
          const [taskData, projectData] = await Promise.all([
            getAdminFarmerTasks({
              program_project_id: projectFilter || undefined,
              status: statusFilter || undefined,
            }),
            getProgramProjects(),
          ]);
          setTasks(taskData.tasks ?? []);
          setProjects(projectData.projects ?? []);
          setCacheFetchedAt(null);
        } catch {
          const cached = await getReadCache<TasksCachePayload>(
            READ_CACHE_KEYS.adminTasks,
            userScope
          );
          if (!cached) throw new Error('offline miss');
          setProjects(cached.payload.projects ?? []);
          setTasks(
            filterTasks(cached.payload.tasks ?? [], {
              projectId: projectFilter || undefined,
              status: statusFilter || undefined,
            })
          );
          setCacheFetchedAt(cached.fetchedAt);
        }
      } else {
        const result = await loadWithReadCache<TasksCachePayload>({
          cacheKey: READ_CACHE_KEYS.adminTasks,
          userScope,
          fetchLive: async () => {
            const [taskData, projectData] = await Promise.all([
              getAdminFarmerTasks({}),
              getProgramProjects(),
            ]);
            return {
              tasks: (taskData.tasks ?? []) as TaskRow[],
              projects: projectData.projects ?? [],
            };
          },
        });
        setTasks(result.data.tasks ?? []);
        setProjects(result.data.projects ?? []);
        setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      }
    } catch {
      setTasks([]);
      setCacheFetchedAt(null);
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter, userScope]);

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
      setSelected(null);
      setApprovalNotes('');
      setRejectReason('');
      await load();
      Alert.alert(
        decision === 'approve' ? 'Approved' : 'Rejected',
        decision === 'approve'
          ? 'Farmer notified (SMS in pilot mode).'
          : 'Farmer notified to resubmit.'
      );
      return;
    }
    if (result.mode === 'offline') {
      setSelected(null);
      setApprovalNotes('');
      setRejectReason('');
      Alert.alert(
        'Saved offline',
        `${decision === 'approve' ? 'Approval' : 'Rejection'} queued. It will sync when you are back online.`
      );
      return;
    }
    Alert.alert('Needs your review', result.error);
  };

  const approve = async () => {
    if (!selected || cacheFetchedAt) return;
    setActing(true);
    try {
      const result = await submitTaskDecisionWithOutbox({
        farmerTaskId: selected.id,
        taskName: selected.name,
        decision: 'approve',
        expectedStatus: selected.status,
        notes: approvalNotes.trim() || undefined,
      });
      await handleDecisionResult(result, 'approve');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!selected || cacheFetchedAt) return;
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason.');
      return;
    }
    setActing(true);
    try {
      const result = await submitTaskDecisionWithOutbox({
        farmerTaskId: selected.id,
        taskName: selected.name,
        decision: 'reject',
        expectedStatus: selected.status,
        rejectionReason: rejectReason.trim(),
      });
      await handleDecisionResult(result, 'reject');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(false);
    }
  };

  const handlePush = async (item: PendingTaskApprovalView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingTaskApproval(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.taskName} ${item.decision === 'approve' ? 'approved' : 'rejected'}.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync');
      }
    } finally {
      setPushingId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissTaskApprovalOutbox(id);
    await loadPending();
  };

  const projectLabel = projects.find((p) => p.id === projectFilter)?.name ?? 'All projects';
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label ?? 'All statuses';
  const canAct = !cacheFetchedAt;
  const useCategorySections = !projectFilter && !statusFilter;

  const categorized = useMemo(() => categorizeTasks(tasks), [tasks]);
  const categorySections = useMemo(() => {
    if (!useCategorySections) return [];
    return [
      { title: `OVERDUE (${categorized.overdue.length})`, data: categorized.overdue },
      { title: `IN PROGRESS (${categorized.inProgress.length})`, data: categorized.inProgress },
      { title: `NOT STARTED (${categorized.notStarted.length})`, data: categorized.notStarted },
      {
        title: `SUBMITTED FOR APPROVAL (${categorized.submittedForApproval.length})`,
        data: categorized.submittedForApproval,
      },
      { title: `REJECTED (${categorized.rejected.length})`, data: categorized.rejected },
      { title: `COMPLETED (${categorized.completed.length})`, data: categorized.completed },
    ].filter((section) => section.data.length > 0);
  }, [categorized, useCategorySections]);

  const renderTaskCard = (item: TaskRow) => (
    <KBCard onPress={() => setSelected(item)}>
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-base font-bold text-[#333333]">{item.name}</Text>
        <KBStatusChip label={taskStatusLabel(item.status)} variant={taskStatusVariant(item.status)} />
      </View>
      <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.program_project_name}</Text>
      <Text className="mt-1 text-[13px] text-[#757575]">KES {(item.payment_value_kes ?? 0).toLocaleString()}{item.due_date ? ` · Due ${item.due_date}` : ''}</Text>
      <Text className="mt-2 text-[13px] font-semibold text-[#1A4D3E]">View details →</Text>
    </KBCard>
  );

  const listHeader = pendingApprovals.length > 0 ? (
    <View className="mb-4">
      <Text className="mb-2 text-[17px] font-bold text-[#333333]">Queued decisions</Text>
      {pendingApprovals.map((item) => (
        <OutboxTaskApprovalCard
          key={item.id}
          item={item}
          pushing={pushingId === item.id}
          onPush={() => handlePush(item)}
          onDismiss={() => handleDismiss(item.id)}
        />
      ))}
    </View>
  ) : null;

  const emptyList = (
    <Text className="p-6 text-center leading-[22px] text-[#757575]">
      No tasks yet. Restart the backend — demo hierarchy seeds automatically on first boot.
    </Text>
  );

  if (loading && tasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <Text className="mb-3 text-[26px] font-bold text-[#1A4D3E]">Tasks</Text>
      {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
      <View className="mb-3 flex-row flex-wrap gap-2">
        <Menu visible={projectMenuOpen} onDismiss={() => setProjectMenuOpen(false)} anchor={
          <PaperButton mode="outlined" onPress={() => setProjectMenuOpen(true)} style={{ flex: 1, minWidth: 140 }}>
            {projectLabel}
          </PaperButton>
        }>
          <Menu.Item onPress={() => { setProjectFilter(''); setProjectMenuOpen(false); }} title="All projects" />
          {projects.map((p) => (
            <Menu.Item key={p.id} onPress={() => { setProjectFilter(p.id); setProjectMenuOpen(false); }} title={p.name} />
          ))}
        </Menu>
        <Menu visible={statusMenuOpen} onDismiss={() => setStatusMenuOpen(false)} anchor={
          <PaperButton mode="outlined" onPress={() => setStatusMenuOpen(true)} style={{ flex: 1, minWidth: 140 }}>
            {statusLabel}
          </PaperButton>
        }>
          {STATUS_OPTIONS.map((s) => (
            <Menu.Item key={s.value || 'all'} onPress={() => { setStatusFilter(s.value); setStatusMenuOpen(false); }} title={s.label} />
          ))}
        </Menu>
      </View>

      {useCategorySections ? (
        <SectionList
          sections={categorySections}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerClassName="pb-8"
          ListHeaderComponent={listHeader}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <Text className="mb-2 mt-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
              {title}
            </Text>
          )}
          renderItem={({ item }) => renderTaskCard(item)}
          ListEmptyComponent={emptyList}
        />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerClassName="pb-8"
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => renderTaskCard(item)}
          ListEmptyComponent={emptyList}
        />
      )}

      <Modal visible={!!selected} animationType="none" transparent onRequestClose={() => setSelected(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <ScrollView className="max-h-[85%] rounded-t-2xl bg-white" contentContainerClassName="p-5 pb-10">
            <Pressable onPress={() => setSelected(null)} className="mb-2 self-end">
              <View className="flex-row items-center gap-1">
                <X size={16} color="#757575" />
                <Text className="text-base text-[#757575]">Close</Text>
              </View>
            </Pressable>
            {selected ? (
              <>
                <Text className="mb-2 text-[22px] font-bold text-[#1A4D3E]">{selected.name}</Text>
                <KBStatusChip label={taskStatusLabel(selected.status)} variant={taskStatusVariant(selected.status)} />
                <Text className="mt-1.5 text-sm text-[#757575]">Farmer: {selected.farmer_name} ({selected.farmer_phone})</Text>
                <Text className="mt-1.5 text-sm text-[#757575]">Project: {selected.program_project_name}</Text>
                <Text className="my-3 text-xl font-bold text-[#D4AF6A]">KES {(selected.payment_value_kes ?? 0).toLocaleString()}</Text>
                {selected.description ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">{selected.description}</Text> : null}
                {selected.notes ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">Notes: {selected.notes}</Text> : null}
                {selected.photo_evidence_url ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">Photo: {selected.photo_evidence_url}</Text> : null}
                {selected.submitted_date ? <Text className="mt-1.5 text-sm text-[#757575]">Submitted: {selected.submitted_date}</Text> : null}
                {selected.rejection_reason ? <Text className="mt-2 text-sm font-semibold text-[#D32F2F]">Rejected: {selected.rejection_reason}</Text> : null}

                {selected.status === 'submitted-for-approval' && canAct ? (
                  <View className="mt-4 gap-2.5">
                    <TextInput
                      className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3"
                      placeholder="Approval notes (optional)"
                      value={approvalNotes}
                      onChangeText={setApprovalNotes}
                    />
                    <Button className="h-11 bg-[#2E7D5E]" onPress={approve} disabled={acting}>
                      {acting ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Approve</Text>}
                    </Button>
                    <TextInput
                      className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3"
                      placeholder="Rejection reason"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                    />
                    <Button variant="outline" className="h-11" onPress={reject} disabled={acting}>
                      {acting ? <ActivityIndicator color="#D32F2F" /> : <Text className="text-[#D32F2F]">Reject</Text>}
                    </Button>
                  </View>
                ) : null}

                {selected.status === 'submitted-for-approval' && !canAct ? (
                  <Text className="mt-4 text-sm leading-5 text-[#FF9800]">
                    Connect to approve or reject — actions are disabled while showing offline data.
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
