import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Ban,
  Bell,
  CircleCheck,
  CircleX,
  Hourglass,
  TriangleAlert,
} from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  createAgentPersonalTask,
  getAgentHelpRequests,
  getAgentTasks,
  resolveAgentHelpRequest,
  setAgentTaskReminder,
  updateAgentPersonalTask,
} from '../../api/client';
import { api } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { isTaskOverdue, categorizeTasks, countOverlappingStatusKpis, isTaskCompletedStatus } from '../../utils/taskCategorization';
import { formatCleanDate } from '../../utils/greeting';
import { isSubmittedForApprovalStatus } from '../../utils/taskStatus';
import type { AgentTabParamList } from '../../navigation/types';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { AddAgentTaskModal } from '../../components/agent/AddAgentTaskModal';
import { AgentTaskDetailModal, type AgentTaskDetail } from '../../components/agent/AgentTaskDetailModal';
import { OutboxAgentTaskApprovalCard } from '../../components/OutboxAgentTaskApprovalCard';
import { OutboxTaskApprovalCard } from '../../components/OutboxTaskApprovalCard';
import {
  TaskStatusKpiRow,
  type TaskStatusKpiKey,
} from '../../components/TaskStatusKpiRow';
import { checkAndShowTaskReminders, setTaskReminder, type ReminderType } from '../../utils/taskReminders';
import {
  dismissAgentTaskApprovalOutbox,
  listPendingAgentTaskApprovals,
  pushPendingAgentTaskApproval,
  submitAgentTaskDecisionWithOutbox,
  syncAllPendingAgentTaskApprovals,
  type PendingAgentTaskApprovalView,
} from '../../services/submitAgentTaskApprovalOutbox';
import {
  dismissTaskApprovalOutbox,
  listPendingTaskApprovals,
  pushPendingTaskApproval,
  submitTaskDecisionWithOutbox,
  syncAllPendingTaskApprovals,
  type PendingTaskApprovalView,
} from '../../services/submitTaskApprovalOutbox';

type UnifiedTask = {
  id: string;
  name: string;
  status: string;
  due_date?: string | null;
  farmer_id?: string;
  farmer_name?: string;
  program_project_name?: string;
  source: 'farmer' | 'personal';
  payment_value_kes?: number;
  notes?: string;
  photo_evidence_url?: string;
  rejection_reason?: string;
  priority?: string;
  description?: string | null;
  assigned_farmer_names?: string[];
  assigned_farmer_ids?: string[];
};

/** Status / KPI filter — includes overdue for KPI sync; raw statuses for the Filters dropdown. */
type StatusFilterKey =
  | 'all'
  | 'overdue'
  | 'not_started'
  | 'in_progress'
  | 'submitted_for_approval'
  | 'approved'
  | 'rejected'
  | 'completed';

const STATUS_FILTER_OPTIONS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: 'all', label: 'All statuses' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'submitted_for_approval', label: 'Submitted for approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'completed', label: 'Completed' },
];

function normalizeTaskStatus(status: string): string {
  const s = status.toLowerCase().replace(/_/g, '-');
  if (s === 'submitted') return 'submitted-for-approval';
  return s;
}

function isRejectedStatus(status: string): boolean {
  return normalizeTaskStatus(status) === 'rejected';
}

function parseAssignedFarmerIds(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return undefined;
}

function firstNameKey(name: string): string {
  return (name.trim().split(/\s+/)[0] || name).toLowerCase();
}

function taskMatchesFarmer(task: UnifiedTask, farmerId: string, farmerName: string): boolean {
  if (task.farmer_id && task.farmer_id === farmerId) return true;
  if (task.assigned_farmer_ids?.includes(farmerId)) return true;
  const name = farmerName.trim().toLowerCase();
  if (!name) return false;
  if (task.farmer_name?.toLowerCase().includes(name)) return true;
  if (task.assigned_farmer_names?.some((n) => n.toLowerCase().includes(name))) return true;
  return false;
}

function taskMatchesStatusFilter(task: UnifiedTask, filter: StatusFilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return isTaskOverdue(task.due_date, task.status);
  const s = normalizeTaskStatus(task.status);
  switch (filter) {
    case 'not_started':
      return s === 'not-started';
    case 'in_progress':
      return s === 'in-progress';
    case 'submitted_for_approval':
      return s === 'submitted-for-approval';
    case 'approved':
      return s === 'approved';
    case 'rejected':
      return s === 'rejected';
    case 'completed':
      // Match KPI / categorizeTasks: approved counts as completed.
      return isTaskCompletedStatus(task.status);
    default:
      return true;
  }
}

function statusFilterToKpiKey(filter: StatusFilterKey): TaskStatusKpiKey | null {
  if (filter === 'all' || filter === 'approved') return null;
  return filter;
}

function formatDue(value?: string | null): string {
  if (!value) return 'No due date';
  return formatCleanDate(value);
}

function isOverdue(due?: string | null, status?: string): boolean {
  return isTaskOverdue(due, status);
}

function TaskSection({
  TitleIcon,
  title,
  color,
  tasks,
  onReminder,
  onTaskPress,
  onExpandApproval,
  expandedId,
  rejectReason,
  setRejectReason,
  acting,
  approve,
  reject,
}: {
  TitleIcon?: ComponentType<{ size?: number; color?: string }>;
  title: string;
  color?: string;
  tasks: UnifiedTask[];
  onReminder: (task: UnifiedTask, type: ReminderType) => void;
  onTaskPress: (task: UnifiedTask) => void;
  onExpandApproval?: (id: string | null) => void;
  expandedId?: string | null;
  rejectReason?: string;
  setRejectReason?: (v: string) => void;
  acting?: string | null;
  approve?: (id: string) => void | Promise<void>;
  reject?: (id: string) => void | Promise<void>;
}) {
  if (!tasks.length) return null;
  const titleColor = color ?? '#757575';
  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-center gap-1.5">
        {TitleIcon ? <TitleIcon size={16} color={titleColor} /> : null}
        <Text className="text-sm font-bold uppercase tracking-wide" style={{ color: titleColor }}>
          {title}
        </Text>
      </View>
      {tasks.map((item) => {
        const isApproval = isSubmittedForApprovalStatus(item.status);
        const expanded = expandedId === item.id;
        const photoUrl = item.photo_evidence_url?.trim() || '';
        return (
          <KBCard
            key={`${item.source}-${item.id}`}
            style={{ marginBottom: 8 }}
            onPress={() => onTaskPress(item)}
          >
            <Text className="text-base font-bold text-[#333333]">{item.name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">
              Due: {formatDue(item.due_date)}
              {isOverdue(item.due_date, item.status) ? ' (overdue)' : ''}
            </Text>
            {item.farmer_name ? (
              <Text className="text-[13px] text-[#757575]">Assigned to: {item.farmer_name}</Text>
            ) : null}
            {item.program_project_name ? (
              <Text className="text-[13px] text-[#757575]">{item.program_project_name}</Text>
            ) : null}
            {isRejectedStatus(item.status) ? (
              <View className="mt-2">
                <KBStatusChip label="Rejected" variant="danger" />
                {item.rejection_reason ? (
                  <Text className="mt-1 text-sm leading-5 text-[#D32F2F]">
                    Reason: {item.rejection_reason}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {item.source === 'personal' && !isApproval && !isRejectedStatus(item.status) ? (
              <View className="mt-2 flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => onReminder(item, '1_day_before')}
                  className="rounded-md bg-[#F0F0F0] px-2 py-1"
                >
                  <View className="flex-row items-center gap-1">
                    <Bell size={12} color="#333333" />
                    <Text className="text-xs">1 day before</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => onReminder(item, '3_days_before')}
                  className="rounded-md bg-[#F0F0F0] px-2 py-1"
                >
                  <View className="flex-row items-center gap-1">
                    <Bell size={12} color="#333333" />
                    <Text className="text-xs">3 days before</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => onReminder(item, 'on_due_date')}
                  className="rounded-md bg-[#F0F0F0] px-2 py-1"
                >
                  <View className="flex-row items-center gap-1">
                    <Bell size={12} color="#333333" />
                    <Text className="text-xs">On due date</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
            {isApproval && onExpandApproval ? (
              <Pressable
                onPress={() => onExpandApproval(expanded ? null : item.id)}
                className="mt-2"
              >
                <KBStatusChip label="Submitted for approval" variant="pending" />
              </Pressable>
            ) : null}
            {expanded && isApproval && approve && reject ? (
              <View className="mt-3 gap-2">
                {item.notes ? (
                  <Text className="text-sm leading-5 text-[#333333]">Notes: {item.notes}</Text>
                ) : (
                  <Text className="text-sm text-[#757575]">No notes provided.</Text>
                )}
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    className="h-40 w-full rounded-xl bg-[#F0F0F0]"
                    resizeMode="cover"
                    accessibilityLabel="Task photo evidence"
                  />
                ) : (
                  <Text className="text-sm font-semibold text-[#D32F2F]">Photo required</Text>
                )}
                <Button
                  className="h-11 bg-[#2E7D5E]"
                  onPress={() => {
                    void Promise.resolve(approve(item.id)).catch(() => undefined);
                  }}
                  disabled={acting === item.id}
                >
                  <Text className="text-white">Approve</Text>
                </Button>
                {setRejectReason ? (
                  <TextInput
                    className="rounded-lg border border-[#E0E0E0] bg-white p-2.5"
                    placeholder="Rejection reason"
                    value={rejectReason ?? ''}
                    onChangeText={setRejectReason}
                  />
                ) : null}
                <Button
                  variant="outline"
                  className="h-11"
                  onPress={() => {
                    void Promise.resolve(reject(item.id)).catch(() => undefined);
                  }}
                  disabled={acting === item.id}
                >
                  <Text className="text-[#D32F2F]">Reject</Text>
                </Button>
              </View>
            ) : (
              <Text className="mt-2 text-xs font-semibold text-[#1A4D3E]">Tap to view details</Text>
            )}
          </KBCard>
        );
      })}
    </View>
  );
}

export function AgentTasksScreen() {
  const route = useRoute<RouteProp<AgentTabParamList, 'Tasks'>>();
  const navigation = useNavigation<NavigationProp<AgentTabParamList>>();
  const [farmerTasks, setFarmerTasks] = useState<UnifiedTask[]>([]);
  const [personalTasks, setPersonalTasks] = useState<UnifiedTask[]>([]);
  const [helpRequests, setHelpRequests] = useState<
    Array<{ id: string; message: string; farmer_name?: string; farmer_phone?: string; created_at?: string }>
  >([]);
  const [farmers, setFarmers] = useState<Array<{ farmer_id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [farmerFilterId, setFarmerFilterId] = useState<string | null>(null);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [farmerMenuOpen, setFarmerMenuOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingTask, setUpdatingTask] = useState(false);
  const [pendingAgentApprovals, setPendingAgentApprovals] = useState<
    PendingAgentTaskApprovalView[]
  >([]);
  const [pendingFarmerApprovals, setPendingFarmerApprovals] = useState<PendingTaskApprovalView[]>(
    []
  );
  const [pushingId, setPushingId] = useState<string | null>(null);

  const mapPersonalTask = (t: Record<string, unknown>): UnifiedTask => {
    const assignedNames = Array.isArray(t.assigned_farmer_names)
      ? (t.assigned_farmer_names as string[])
      : undefined;
    const assignedIds = parseAssignedFarmerIds(t.assigned_farmer_ids);
    return {
      id: String(t.id),
      name: String(t.name ?? ''),
      status: String(t.status ?? 'not_started'),
      due_date: t.due_date as string | null,
      priority: t.priority as string | undefined,
      description: t.description as string | null | undefined,
      assigned_farmer_names: assignedNames,
      assigned_farmer_ids: assignedIds,
      farmer_name: assignedNames?.length
        ? assignedNames.join(', ')
        : (t.farmer_name as string | undefined),
      notes: t.notes as string | undefined,
      photo_evidence_url: t.photo_evidence_url as string | undefined,
      rejection_reason: t.rejection_reason as string | undefined,
      source: 'personal' as const,
    };
  };

  const toTaskDetail = (task: UnifiedTask): AgentTaskDetail => ({
    id: task.id,
    name: task.name,
    status: task.status,
    due_date: task.due_date,
    description: task.description,
    farmer_name: task.farmer_name,
    program_project_name: task.program_project_name,
    payment_value_kes: task.payment_value_kes,
    notes: task.notes,
    photo_evidence_url: task.photo_evidence_url,
    rejection_reason: task.rejection_reason,
    priority: task.priority,
    source: task.source,
    assigned_farmer_names: task.assigned_farmer_names,
  });

  const openTaskDetail = (task: UnifiedTask) => {
    setSelectedTask(toTaskDetail(task));
    setDetailOpen(true);
  };

  const loadPending = useCallback(async () => {
    try {
      const [agentPending, farmerPending] = await Promise.all([
        listPendingAgentTaskApprovals(),
        listPendingTaskApprovals(),
      ]);
      setPendingAgentApprovals(agentPending);
      setPendingFarmerApprovals(farmerPending);
    } catch {
      /* keep existing pending lists */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const tasksData = await getAgentTasks();
      const ft = (tasksData.farmer_tasks ?? []).map((t: Record<string, unknown>) => ({
        id: String(t.id),
        name: String(t.name ?? ''),
        status: String(t.status ?? 'not_started'),
        due_date: t.due_date as string | null,
        farmer_id: t.farmer_id ? String(t.farmer_id) : undefined,
        farmer_name: t.farmer_name as string | undefined,
        program_project_name: t.program_project_name as string | undefined,
        payment_value_kes: t.payment_value_kes as number | undefined,
        notes: t.notes as string | undefined,
        photo_evidence_url: t.photo_evidence_url as string | undefined,
        rejection_reason: t.rejection_reason as string | undefined,
        description: t.description as string | null | undefined,
        source: 'farmer' as const,
      }));
      const pt = (tasksData.personal_tasks ?? []).map((t: Record<string, unknown>) =>
        mapPersonalTask(t)
      );
      setFarmerTasks(ft);
      setPersonalTasks(pt);
    } catch {
      /* keep existing task lists on partial failure */
    }

    try {
      const helpData = await getAgentHelpRequests();
      setHelpRequests(helpData.requests ?? []);
    } catch {
      /* keep existing help requests */
    }

    try {
      const farmersRes = await api.get('/agents/farmers');
      setFarmers((farmersRes.data.farmers ?? []).map((f: { farmer_id: string; name: string }) => ({
        farmer_id: f.farmer_id,
        name: f.name,
      })));
    } catch {
      /* keep existing farmers list */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await Promise.all([
          syncAllPendingAgentTaskApprovals(),
          syncAllPendingTaskApprovals(),
        ]);
        await Promise.all([load(), loadPending()]);
        checkAndShowTaskReminders();
      })();
    }, [load, loadPending])
  );

  // Dashboard KPI / notification deep-links: apply filter (and openAdd) from route params.
  useEffect(() => {
    const routeFilter = route.params?.filter;
    if (routeFilter) {
      setStatusFilter(routeFilter as StatusFilterKey);
      setShowFiltersPanel(false);
      navigation.setParams({ filter: undefined });
    }
    if (route.params?.openAdd) {
      setAddModalOpen(true);
      navigation.setParams({ openAdd: undefined });
    }
  }, [navigation, route.params?.filter, route.params?.openAdd]);

  // After tasks load, open detail for notification deep-links
  useEffect(() => {
    const deepLinkTaskId = route.params?.taskId ?? route.params?.highlightTaskId;
    if (!deepLinkTaskId || loading) return;
    const match = [...farmerTasks, ...personalTasks].find((t) => t.id === deepLinkTaskId);
    if (!match) return;
    setSelectedTask(toTaskDetail(match));
    setDetailOpen(true);
    if (isSubmittedForApprovalStatus(match.status)) {
      setExpandedId(match.id);
    }
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined });
  }, [
    route.params?.taskId,
    route.params?.highlightTaskId,
    farmerTasks,
    personalTasks,
    loading,
    navigation,
  ]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      syncAllPendingAgentTaskApprovals(),
      syncAllPendingTaskApprovals(),
    ]);
    await Promise.all([load(), loadPending()]);
    setRefreshing(false);
  };

  const allTasks = useMemo(() => [...farmerTasks, ...personalTasks], [farmerTasks, personalTasks]);

  const farmersSorted = useMemo(
    () =>
      [...farmers].sort((a, b) => {
        const byFirst = firstNameKey(a.name).localeCompare(firstNameKey(b.name));
        return byFirst !== 0 ? byFirst : a.name.localeCompare(b.name);
      }),
    [farmers]
  );

  const selectedFarmer = useMemo(
    () => (farmerFilterId ? farmers.find((f) => f.farmer_id === farmerFilterId) : null),
    [farmerFilterId, farmers]
  );

  /** Search → farmer → My Tasks (status applied after KPI counts). */
  const scopedTasks = useMemo(() => {
    let list = allTasks;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.farmer_name?.toLowerCase().includes(q) ?? false)
      );
    }
    if (farmerFilterId && selectedFarmer) {
      list = list.filter((t) =>
        taskMatchesFarmer(t, selectedFarmer.farmer_id, selectedFarmer.name)
      );
    }
    if (myTasksOnly) {
      list = list.filter((t) => t.source === 'personal');
    }
    return list;
  }, [allTasks, search, farmerFilterId, selectedFarmer, myTasksOnly]);

  const statusFilteredTasks = useMemo(
    () => scopedTasks.filter((t) => taskMatchesStatusFilter(t, statusFilter)),
    [scopedTasks, statusFilter]
  );

  const categoryCounts = useMemo(
    () => countOverlappingStatusKpis(scopedTasks),
    [scopedTasks]
  );

  const displayCategories = useMemo(
    () => categorizeTasks(statusFilteredTasks),
    [statusFilteredTasks]
  );

  useEffect(() => {
    if (loading) return;
    if (statusFilter === 'rejected' && categoryCounts.rejected === 0) {
      setStatusFilter('all');
    }
    if (
      statusFilter === 'submitted_for_approval' &&
      categoryCounts.submitted_for_approval === 0
    ) {
      setStatusFilter('all');
    }
  }, [
    loading,
    statusFilter,
    categoryCounts.rejected,
    categoryCounts.submitted_for_approval,
  ]);

  const toggleKpiFilter = (key: TaskStatusKpiKey) => {
    setStatusFilter((prev) => (prev === key ? 'all' : key));
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setFarmerFilterId(null);
    setMyTasksOnly(false);
    setStatusMenuOpen(false);
    setFarmerMenuOpen(false);
  };

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (farmerFilterId ? 1 : 0) + (myTasksOnly ? 1 : 0);

  const statusFilterLabel =
    STATUS_FILTER_OPTIONS.find((o) => o.key === statusFilter)?.label ?? 'All statuses';

  const overdue = displayCategories.overdue;
  const inProgress = displayCategories.inProgress;
  const notStarted = displayCategories.notStarted;
  const submittedForApproval = displayCategories.submittedForApproval;
  const rejected = displayCategories.rejected;
  const completed = displayCategories.completed;
  const hasVisibleTasks =
    overdue.length +
      inProgress.length +
      notStarted.length +
      submittedForApproval.length +
      rejected.length +
      completed.length >
    0;

  const markContacted = async (id: string) => {
    setActing(id);
    try {
      await resolveAgentHelpRequest(id);
      await load();
      Alert.alert('Done', 'Marked as contacted.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not update'));
    } finally {
      setActing(null);
    }
  };

  const findTask = (id: string): UnifiedTask | undefined =>
    allTasks.find((t) => t.id === id);

  const handleDecisionResult = async (
    result:
      | Awaited<ReturnType<typeof submitAgentTaskDecisionWithOutbox>>
      | Awaited<ReturnType<typeof submitTaskDecisionWithOutbox>>,
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
          ? 'Task approved.'
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

  const approve = async (id: string) => {
    const task = findTask(id) ?? (selectedTask?.id === id ? selectedTask : undefined);
    if (!task) {
      Alert.alert('Error', 'Task not found');
      throw new Error('Task not found');
    }
    setActing(id);
    try {
      if (task.source === 'personal') {
        const result = await submitAgentTaskDecisionWithOutbox({
          agentTaskId: id,
          taskName: task.name,
          decision: 'approve',
          expectedStatus: task.status || 'submitted-for-approval',
        });
        await handleDecisionResult(result, 'approve');
      } else {
        const result = await submitTaskDecisionWithOutbox({
          farmerTaskId: id,
          taskName: task.name,
          decision: 'approve',
          expectedStatus: task.status || 'submitted-for-approval',
        });
        await handleDecisionResult(result, 'approve');
      }
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
      throw err;
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string, reasonOverride?: string) => {
    const reason = (reasonOverride ?? rejectReason).trim();
    if (!reason) {
      Alert.alert('Reason required', 'Enter a rejection reason.');
      throw new Error('Rejection reason required');
    }
    const task = findTask(id) ?? (selectedTask?.id === id ? selectedTask : undefined);
    if (!task) {
      Alert.alert('Error', 'Task not found');
      throw new Error('Task not found');
    }
    setActing(id);
    try {
      if (task.source === 'personal') {
        const result = await submitAgentTaskDecisionWithOutbox({
          agentTaskId: id,
          taskName: task.name,
          decision: 'reject',
          expectedStatus: task.status || 'submitted-for-approval',
          rejectionReason: reason,
        });
        await handleDecisionResult(result, 'reject');
      } else {
        const result = await submitTaskDecisionWithOutbox({
          farmerTaskId: id,
          taskName: task.name,
          decision: 'reject',
          expectedStatus: task.status || 'submitted-for-approval',
          rejectionReason: reason,
        });
        await handleDecisionResult(result, 'reject');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Rejection reason required') throw err;
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
      throw err;
    } finally {
      setActing(null);
    }
  };

  const handlePushAgentApproval = async (item: PendingAgentTaskApprovalView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingAgentTaskApproval(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.taskName} updated.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error || 'Conflict detected');
      } else {
        Alert.alert('Sync failed', result.error || 'Could not sync');
      }
    } finally {
      setPushingId(null);
    }
  };

  const handlePushFarmerApproval = async (item: PendingTaskApprovalView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingTaskApproval(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.taskName} updated.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error || 'Conflict detected');
      } else {
        Alert.alert('Sync failed', result.error || 'Could not sync');
      }
    } finally {
      setPushingId(null);
    }
  };

  const handleReminder = async (task: UnifiedTask, type: ReminderType) => {
    if (!task.due_date) {
      Alert.alert('No due date', 'This task has no due date for reminders.');
      return;
    }
    await setTaskReminder(task.id, task.name, task.due_date, type);
    if (task.source === 'personal') {
      try {
        await setAgentTaskReminder(task.id, type);
      } catch {
        /* local reminder still set */
      }
    }
  };

  const handleUpdatePersonalStatus = async (taskId: string, status: string) => {
    setUpdatingTask(true);
    try {
      const result = await updateAgentPersonalTask(taskId, { status });
      const updated = result?.task as Record<string, unknown> | undefined;
      if (updated) {
        const mapped = mapPersonalTask(updated);
        setPersonalTasks((prev) => prev.map((t) => (t.id === taskId ? mapped : t)));
        setSelectedTask(toTaskDetail(mapped));
      }
      await load();
    } finally {
      setUpdatingTask(false);
    }
  };

  const handleCreateTask = async (data: {
    name: string;
    description?: string;
    due_date: string;
    priority: string;
    assigned_farmers?: string[];
  }) => {
    setCreating(true);
    try {
      const result = await createAgentPersonalTask(data);
      const created = result?.task as Record<string, unknown> | undefined;
      if (created?.id) {
        const mapped = mapPersonalTask(created);
        setPersonalTasks((prev) => {
          if (prev.some((t) => t.id === mapped.id)) return prev;
          return [...prev, mapped];
        });
      }
      resetFilters();
      setSearch('');
      navigation.setParams({ filter: undefined });
      await load();
      setAddModalOpen(false);
      showMessage('Task created', 'Your task is now in the Tasks list.');
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Could not create task');
      showMessage('Could not create task', msg);
      throw err;
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-[#F5F5F5]"
        contentContainerClassName="p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Pressable
          onPress={() => setAddModalOpen(true)}
          className="mb-3 h-12 items-center justify-center rounded-lg bg-[#FFD700]"
          style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
        >
          <Text className="font-bold text-black">+ Create task</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-[#333333]">Tasks</Text>
        <TaskStatusKpiRow
          counts={categoryCounts}
          selected={statusFilterToKpiKey(statusFilter)}
          onSelect={toggleKpiFilter}
        />
        {statusFilter !== 'all' ? (
          <Text className="mb-3 mt-2 text-xs text-[#757575]">
            Tap the selected card again to clear status filter
          </Text>
        ) : (
          <Text className="mb-3 mt-2 text-xs text-[#757575]">Tap a card to filter by status</Text>
        )}

        <View className="mb-3 flex-row items-center gap-2">
          <Pressable
            onPress={() => {
              setShowFiltersPanel((open) => !open);
              setStatusMenuOpen(false);
              setFarmerMenuOpen(false);
            }}
            className={`flex-row items-center gap-1 rounded-lg px-3 py-2 ${
              showFiltersPanel || activeFilterCount > 0 ? 'bg-[#1A4D3E]' : 'bg-white'
            }`}
            style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
          >
            <Text
              className={`text-sm font-semibold ${
                showFiltersPanel || activeFilterCount > 0 ? 'text-white' : 'text-[#333333]'
              }`}
            >
              Filters
            </Text>
            {activeFilterCount > 0 ? (
              <View className="min-w-[18px] items-center rounded-full bg-[#FFD700] px-1.5">
                <Text className="text-[11px] font-bold text-[#1A1A1A]">{activeFilterCount}</Text>
              </View>
            ) : (
              <Text
                className={`text-xs ${
                  showFiltersPanel || activeFilterCount > 0 ? 'text-white/80' : 'text-[#757575]'
                }`}
              >
                ▼
              </Text>
            )}
          </Pressable>
          <View className="flex-1 flex-row items-center rounded-lg bg-white px-3">
            <Ionicons name="search" size={18} color="#757575" />
            <TextInput
              className="flex-1 py-2 pl-2"
              placeholder="Search task or farmer"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>

        {showFiltersPanel ? (
          <View className="mb-4 rounded-xl border border-[#E5E5E5] bg-white p-3">
            <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#757575]">
              Status
            </Text>
            <Pressable
              onPress={() => {
                setStatusMenuOpen((o) => !o);
                setFarmerMenuOpen(false);
              }}
              className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
            >
              <Text className="text-sm text-[#333333]">{statusFilterLabel}</Text>
              <Text className="text-xs text-[#757575]">{statusMenuOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {statusMenuOpen ? (
              <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                <ScrollView nestedScrollEnabled>
                  {STATUS_FILTER_OPTIONS.filter(
                    (opt) =>
                      (opt.key !== 'rejected' || categoryCounts.rejected > 0 || statusFilter === 'rejected') &&
                      (opt.key !== 'submitted_for_approval' ||
                        categoryCounts.submitted_for_approval > 0 ||
                        statusFilter === 'submitted_for_approval')
                  ).map((opt) => (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        setStatusFilter(opt.key);
                        setStatusMenuOpen(false);
                      }}
                      className={`px-3 py-2.5 ${
                        statusFilter === opt.key ? 'bg-[#E8F5F0]' : 'bg-white'
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          statusFilter === opt.key
                            ? 'font-semibold text-[#1A4D3E]'
                            : 'text-[#333333]'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#757575]">
              Farmer
            </Text>
            <Pressable
              onPress={() => {
                setFarmerMenuOpen((o) => !o);
                setStatusMenuOpen(false);
              }}
              className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
            >
              <Text className="flex-1 text-sm text-[#333333]" numberOfLines={1}>
                {selectedFarmer?.name ?? 'All farmers'}
              </Text>
              <Text className="text-xs text-[#757575]">{farmerMenuOpen ? '▲' : '▼'}</Text>
            </Pressable>
            {farmerMenuOpen ? (
              <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                <ScrollView nestedScrollEnabled>
                  <Pressable
                    onPress={() => {
                      setFarmerFilterId(null);
                      setFarmerMenuOpen(false);
                    }}
                    className={`px-3 py-2.5 ${!farmerFilterId ? 'bg-[#E8F5F0]' : 'bg-white'}`}
                  >
                    <Text
                      className={`text-sm ${
                        !farmerFilterId ? 'font-semibold text-[#1A4D3E]' : 'text-[#333333]'
                      }`}
                    >
                      All farmers
                    </Text>
                  </Pressable>
                  {farmersSorted.map((f) => (
                    <Pressable
                      key={f.farmer_id}
                      onPress={() => {
                        setFarmerFilterId(f.farmer_id);
                        setFarmerMenuOpen(false);
                      }}
                      className={`px-3 py-2.5 ${
                        farmerFilterId === f.farmer_id ? 'bg-[#E8F5F0]' : 'bg-white'
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          farmerFilterId === f.farmer_id
                            ? 'font-semibold text-[#1A4D3E]'
                            : 'text-[#333333]'
                        }`}
                      >
                        {f.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View className="mt-1 flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setMyTasksOnly((v) => !v)}
                className={`rounded-lg px-3 py-2.5 ${
                  myTasksOnly ? 'bg-[#1A4D3E]' : 'border border-[#E0E0E0] bg-[#FAFAFA]'
                }`}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
              >
                <Text
                  className={`text-sm font-semibold ${
                    myTasksOnly ? 'text-white' : 'text-[#333333]'
                  }`}
                >
                  My Tasks
                </Text>
              </Pressable>
              <Pressable
                onPress={resetFilters}
                className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2.5"
                style={Platform.OS === 'web' ? { cursor: 'pointer' } : undefined}
              >
                <Text className="text-sm font-semibold text-[#757575]">Reset</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {pendingAgentApprovals.length + pendingFarmerApprovals.length > 0 ? (
          <View className="mb-5">
            <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
              Queued decisions
            </Text>
            {pendingAgentApprovals.map((item) => (
              <OutboxAgentTaskApprovalCard
                key={item.id}
                item={item}
                pushing={pushingId === item.id}
                onPush={() => handlePushAgentApproval(item)}
                onDismiss={() => dismissAgentTaskApprovalOutbox(item.id).then(loadPending)}
              />
            ))}
            {pendingFarmerApprovals.map((item) => (
              <OutboxTaskApprovalCard
                key={item.id}
                item={item}
                pushing={pushingId === item.id}
                onPush={() => handlePushFarmerApproval(item)}
                onDismiss={() => dismissTaskApprovalOutbox(item.id).then(loadPending)}
              />
            ))}
          </View>
        ) : null}

        <TaskSection
          TitleIcon={TriangleAlert}
          title={`Overdue (${overdue.length})`}
          color="#EF4444"
          tasks={overdue}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
          onExpandApproval={setExpandedId}
          expandedId={expandedId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          acting={acting}
          approve={approve}
          reject={reject}
        />

        {helpRequests.length > 0 ? (
          <View className="mb-5">
            <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
              Farmer help requests
            </Text>
            {helpRequests.map((item) => (
              <KBCard key={item.id} style={{ marginBottom: 8 }}>
                <Text className="font-bold text-[#333333]">{item.farmer_name}</Text>
                <Text className="text-sm text-[#757575]">{item.message}</Text>
                <Button className="mt-2 h-10 bg-[#1A4D3E]" onPress={() => markContacted(item.id)} disabled={acting === item.id}>
                  <Text className="text-white">Mark contacted</Text>
                </Button>
              </KBCard>
            ))}
          </View>
        ) : null}

        <TaskSection
          TitleIcon={Hourglass}
          title={`In progress (${inProgress.length})`}
          color="#2563EB"
          tasks={inProgress}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
          onExpandApproval={setExpandedId}
          expandedId={expandedId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          acting={acting}
          approve={approve}
          reject={reject}
        />
        <TaskSection
          TitleIcon={Ban}
          title={`Not started (${notStarted.length})`}
          color="#757575"
          tasks={notStarted}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
        />
        <TaskSection
          TitleIcon={Hourglass}
          title={`Submitted for approval (${submittedForApproval.length})`}
          color="#1565C0"
          tasks={submittedForApproval}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
          onExpandApproval={setExpandedId}
          expandedId={expandedId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          acting={acting}
          approve={approve}
          reject={reject}
        />
        <TaskSection
          TitleIcon={CircleX}
          title={`Rejected (${rejected.length})`}
          color="#D32F2F"
          tasks={rejected}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
        />
        <TaskSection
          TitleIcon={CircleCheck}
          title={`Completed (${completed.length})`}
          color="#10B981"
          tasks={completed}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
        />

        {!hasVisibleTasks && helpRequests.length === 0 ? (
          <View className="items-center rounded-xl bg-white p-6">
            <Ionicons name="checkmark-circle-outline" size={48} color="#2E7D5E" />
            <Text className="mt-3 text-center text-[#757575]">No tasks match your filters.</Text>
          </View>
        ) : null}
      </ScrollView>

      <AgentTaskDetailModal
        task={selectedTask}
        visible={detailOpen}
        loading={updatingTask}
        onClose={() => {
          setDetailOpen(false);
          setSelectedTask(null);
        }}
        onUpdateStatus={handleUpdatePersonalStatus}
        onApprove={async (id) => {
          await approve(id);
          setDetailOpen(false);
          setSelectedTask(null);
        }}
        onReject={async (id, reason) => {
          await reject(id, reason);
          setDetailOpen(false);
          setSelectedTask(null);
        }}
      />

      <AddAgentTaskModal
        visible={addModalOpen}
        farmers={farmers}
        loading={creating}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleCreateTask}
      />
    </>
  );
}
