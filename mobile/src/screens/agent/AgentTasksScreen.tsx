import React, { useCallback, useMemo, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  Ban,
  Bell,
  CircleCheck,
  Clock,
  Hourglass,
  TriangleAlert,
} from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  approveFarmerTask,
  createAgentPersonalTask,
  getAgentHelpRequests,
  getAgentTasks,
  rejectFarmerTask,
  resolveAgentHelpRequest,
  setAgentTaskReminder,
  updateAgentPersonalTask,
} from '../../api/client';
import { api } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { isAgentTaskOverdue, isAgentTaskUpcoming } from '../../utils/agentTaskDue';
import { formatCleanDate } from '../../utils/greeting';
import type { AgentTabParamList } from '../../navigation/types';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { AddAgentTaskModal } from '../../components/agent/AddAgentTaskModal';
import { AgentTaskDetailModal, type AgentTaskDetail } from '../../components/agent/AgentTaskDetailModal';
import { checkAndShowTaskReminders, setTaskReminder, type ReminderType } from '../../utils/taskReminders';

type UnifiedTask = {
  id: string;
  name: string;
  status: string;
  due_date?: string | null;
  farmer_name?: string;
  program_project_name?: string;
  source: 'farmer' | 'personal';
  payment_value_kes?: number;
  notes?: string;
  photo_evidence_url?: string;
  priority?: string;
  description?: string | null;
  assigned_farmer_names?: string[];
};

type FilterKey = 'all' | 'overdue' | 'not_started' | 'in_progress' | 'completed';

function formatDue(value?: string | null): string {
  if (!value) return 'No due date';
  return formatCleanDate(value);
}

function isOverdue(due?: string | null, status?: string): boolean {
  return isAgentTaskOverdue(due, status);
}

function isUpcoming(due?: string | null, status?: string): boolean {
  return isAgentTaskUpcoming(due, status);
}

function normalizeStatus(status: string): string {
  if (status === 'submitted-for-approval' || status === 'submitted') return 'in_progress';
  if (status === 'not-started' || status === 'not_started') return 'not_started';
  if (status === 'approved' || status === 'completed') return 'completed';
  return status;
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
  onExpandApproval?: (id: string) => void;
  expandedId?: string | null;
  rejectReason?: string;
  setRejectReason?: (v: string) => void;
  acting?: string | null;
  approve?: (id: string) => void;
  reject?: (id: string) => void;
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
        const isApproval = item.status === 'submitted-for-approval' || item.status === 'submitted';
        const expanded = expandedId === item.id;
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
            {item.source === 'personal' ? (
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
              <Pressable onPress={() => onExpandApproval(item.id)} className="mt-2">
                <KBStatusChip label="Submitted for approval" variant="pending" />
              </Pressable>
            ) : null}
            {expanded && isApproval && approve && reject ? (
              <View className="mt-3 gap-2">
                {item.notes ? <Text className="text-sm">Notes: {item.notes}</Text> : null}
                <Button className="h-11 bg-[#2E7D5E]" onPress={() => approve(item.id)} disabled={acting === item.id}>
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
                <Button variant="outline" className="h-11" onPress={() => reject(item.id)} disabled={acting === item.id}>
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
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showFilter, setShowFilter] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgentTaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingTask, setUpdatingTask] = useState(false);

  const mapPersonalTask = (t: Record<string, unknown>): UnifiedTask => ({
    id: String(t.id),
    name: String(t.name ?? ''),
    status: String(t.status ?? 'not_started'),
    due_date: t.due_date as string | null,
    priority: t.priority as string | undefined,
    description: t.description as string | null | undefined,
    assigned_farmer_names: Array.isArray(t.assigned_farmer_names)
      ? (t.assigned_farmer_names as string[])
      : undefined,
    source: 'personal' as const,
  });

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
    priority: task.priority,
    source: task.source,
    assigned_farmer_names: task.assigned_farmer_names,
  });

  const openTaskDetail = (task: UnifiedTask) => {
    setSelectedTask(toTaskDetail(task));
    setDetailOpen(true);
  };

  const load = useCallback(async () => {
    try {
      const tasksData = await getAgentTasks();
      const ft = (tasksData.farmer_tasks ?? []).map((t: Record<string, unknown>) => ({
        id: String(t.id),
        name: String(t.name ?? ''),
        status: String(t.status ?? 'not_started'),
        due_date: t.due_date as string | null,
        farmer_name: t.farmer_name as string | undefined,
        program_project_name: t.program_project_name as string | undefined,
        payment_value_kes: t.payment_value_kes as number | undefined,
        notes: t.notes as string | undefined,
        photo_evidence_url: t.photo_evidence_url as string | undefined,
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
      const routeFilter = route.params?.filter;
      if (routeFilter) {
        setFilter(routeFilter);
        setShowFilter(false);
        navigation.setParams({ filter: undefined });
      }
      if (route.params?.openAdd) {
        setAddModalOpen(true);
        navigation.setParams({ openAdd: undefined });
      }
      load();
      checkAndShowTaskReminders();
    }, [load, navigation, route.params?.filter, route.params?.openAdd])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const allTasks = useMemo(() => [...farmerTasks, ...personalTasks], [farmerTasks, personalTasks]);

  const filtered = useMemo(() => {
    let list = allTasks;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.farmer_name?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filter === 'overdue') {
      list = list.filter(
        (t) => isOverdue(t.due_date, t.status) && normalizeStatus(t.status) !== 'completed'
      );
    } else if (filter !== 'all') {
      list = list.filter((t) => normalizeStatus(t.status) === filter);
    }
    return list;
  }, [allTasks, search, filter]);

  const upcoming = filtered.filter(
    (t) => isUpcoming(t.due_date, t.status) && normalizeStatus(t.status) !== 'completed'
  );
  const overdue = filtered.filter(
    (t) => isOverdue(t.due_date, t.status) && normalizeStatus(t.status) !== 'completed'
  );
  const completed = filtered.filter((t) => normalizeStatus(t.status) === 'completed');
  const inProgress = filtered.filter(
    (t) =>
      normalizeStatus(t.status) === 'in_progress' &&
      !isOverdue(t.due_date, t.status) &&
      !isUpcoming(t.due_date, t.status)
  );
  const notStarted = filtered.filter(
    (t) =>
      normalizeStatus(t.status) === 'not_started' &&
      !isOverdue(t.due_date, t.status) &&
      !isUpcoming(t.due_date, t.status)
  );

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

  const approve = async (id: string) => {
    setActing(id);
    try {
      await approveFarmerTask(id);
      await load();
      Alert.alert('Approved', 'Task approved.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason.');
      return;
    }
    setActing(id);
    try {
      await rejectFarmerTask(id, rejectReason.trim());
      setRejectReason('');
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(null);
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

  const personalOnly = useMemo(() => {
    let list = personalTasks;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [personalTasks, search]);

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
        setHighlightTaskId(mapped.id);
      }
      setFilter('all');
      setShowFilter(false);
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

  const filterLabels: Record<FilterKey, string> = {
    all: 'All tasks',
    overdue: 'Overdue',
    not_started: 'Not started',
    in_progress: 'In progress',
    completed: 'Completed',
  };

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

        <View className="mb-3 flex-row items-center gap-2">
          <Pressable onPress={() => setShowFilter(!showFilter)} className="flex-row items-center gap-1 rounded-lg bg-white px-3 py-2">
            <Text className="text-sm">Filter ▼</Text>
            <Text className="text-xs text-[#757575]">{filterLabels[filter]}</Text>
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
        {showFilter ? (
          <View className="mb-3 flex-row flex-wrap gap-2">
            {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => {
                  setFilter(key);
                  setShowFilter(false);
                }}
                className={`rounded-lg px-3 py-2 ${filter === key ? 'bg-[#1A4D3E]' : 'bg-white'}`}
              >
                <Text className={filter === key ? 'text-white' : 'text-[#333333]'}>
                  {filterLabels[key]}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <TaskSection
          TitleIcon={TriangleAlert}
          title="Overdue"
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

        {personalOnly.length > 0 ? (
          <View className="mb-5">
            <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
              Your profile tasks ({personalOnly.length})
            </Text>
            {personalOnly.map((item) => (
              <KBCard
                key={`profile-${item.id}`}
                style={{
                  marginBottom: 8,
                  borderWidth: highlightTaskId === item.id ? 2 : 0,
                  borderColor: highlightTaskId === item.id ? '#1A4D3E' : undefined,
                }}
                onPress={() => openTaskDetail(item)}
              >
                <Text className="text-base font-bold text-[#333333]">{item.name}</Text>
                <Text className="mt-1 text-[13px] text-[#757575]">Due: {formatDue(item.due_date)}</Text>
                <Text className="text-[13px] text-[#757575]">
                  Status: {item.status.replace(/_/g, ' ')}
                </Text>
                {item.assigned_farmer_names?.length ? (
                  <Text className="text-[13px] text-[#757575]">
                    Farmers: {item.assigned_farmer_names.join(', ')}
                  </Text>
                ) : (
                  <Text className="text-[13px] text-[#757575]">Assigned to: You</Text>
                )}
                <Text className="mt-1 text-xs font-semibold text-[#1A4D3E]">Tap to view or update</Text>
              </KBCard>
            ))}
          </View>
        ) : null}

        <TaskSection
          TitleIcon={Clock}
          title="Upcoming (due in 7 days)"
          color="#1A4D3E"
          tasks={upcoming}
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
          TitleIcon={Hourglass}
          title="In progress"
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
          title="Not started"
          color="#757575"
          tasks={notStarted}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
        />
        <TaskSection
          TitleIcon={CircleCheck}
          title="Completed"
          color="#10B981"
          tasks={completed}
          onReminder={handleReminder}
          onTaskPress={openTaskDetail}
        />

        {filtered.length === 0 && personalOnly.length === 0 && helpRequests.length === 0 ? (
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
          setActing(id);
          try {
            await rejectFarmerTask(id, reason);
            await load();
            Alert.alert('Rejected', 'Farmer can resubmit after rework.');
            setDetailOpen(false);
            setSelectedTask(null);
          } catch (err: unknown) {
            Alert.alert('Error', extractApiError(err, 'Could not reject'));
            throw err;
          } finally {
            setActing(null);
          }
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
