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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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
} from '../../api/client';
import { api } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { AddAgentTaskModal } from '../../components/agent/AddAgentTaskModal';
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
};

type FilterKey = 'all' | 'overdue' | 'not_started' | 'in_progress' | 'completed';

function formatDue(value?: string | null): string {
  if (!value) return 'No due date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(due?: string | null): boolean {
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isUpcoming(due?: string | null): boolean {
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() + 7);
  d.setHours(0, 0, 0, 0);
  return d >= today && d <= week;
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
          <KBCard key={`${item.source}-${item.id}`} style={{ marginBottom: 8 }}>
            <Text className="text-base font-bold text-[#333333]">{item.name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">
              Due: {formatDue(item.due_date)}
              {isOverdue(item.due_date) ? ' (overdue)' : ''}
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
            ) : null}
          </KBCard>
        );
      })}
    </View>
  );
}

export function AgentTasksScreen() {
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

  const load = useCallback(async () => {
    try {
      const [tasksData, helpData, farmersRes] = await Promise.all([
        getAgentTasks(),
        getAgentHelpRequests(),
        api.get('/agents/farmers'),
      ]);
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
        source: 'farmer' as const,
      }));
      const pt = (tasksData.personal_tasks ?? []).map((t: Record<string, unknown>) => ({
        id: String(t.id),
        name: String(t.name ?? ''),
        status: String(t.status ?? 'not_started'),
        due_date: t.due_date as string | null,
        priority: t.priority as string | undefined,
        source: 'personal' as const,
      }));
      setFarmerTasks(ft);
      setPersonalTasks(pt);
      setHelpRequests(helpData.requests ?? []);
      setFarmers((farmersRes.data.farmers ?? []).map((f: { farmer_id: string; name: string }) => ({
        farmer_id: f.farmer_id,
        name: f.name,
      })));
    } catch {
      setFarmerTasks([]);
      setPersonalTasks([]);
      setHelpRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      checkAndShowTaskReminders();
    }, [load])
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
      list = list.filter((t) => isOverdue(t.due_date) && normalizeStatus(t.status) !== 'completed');
    } else if (filter !== 'all') {
      list = list.filter((t) => normalizeStatus(t.status) === filter);
    }
    return list;
  }, [allTasks, search, filter]);

  const upcoming = filtered.filter(
    (t) => isUpcoming(t.due_date) && normalizeStatus(t.status) !== 'completed'
  );
  const overdue = filtered.filter(
    (t) => isOverdue(t.due_date) && normalizeStatus(t.status) !== 'completed'
  );
  const completed = filtered.filter((t) => normalizeStatus(t.status) === 'completed');
  const inProgress = filtered.filter(
    (t) =>
      normalizeStatus(t.status) === 'in_progress' &&
      !isOverdue(t.due_date) &&
      !isUpcoming(t.due_date)
  );
  const notStarted = filtered.filter(
    (t) =>
      normalizeStatus(t.status) === 'not_started' &&
      !isOverdue(t.due_date) &&
      !isUpcoming(t.due_date)
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

  const handleCreateTask = async (data: {
    name: string;
    description?: string;
    due_date: string;
    priority: string;
    assigned_farmers?: string[];
  }) => {
    setCreating(true);
    try {
      await createAgentPersonalTask(data);
      await load();
      Alert.alert('Task created', 'Personal task added to your profile.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not create task'));
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
          TitleIcon={Clock}
          title="Upcoming (due in 7 days)"
          color="#1A4D3E"
          tasks={upcoming}
          onReminder={handleReminder}
          onExpandApproval={setExpandedId}
          expandedId={expandedId}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          acting={acting}
          approve={approve}
          reject={reject}
        />
        <TaskSection
          TitleIcon={TriangleAlert}
          title="Overdue"
          color="#EF4444"
          tasks={overdue}
          onReminder={handleReminder}
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
        />
        <TaskSection
          TitleIcon={CircleCheck}
          title="Completed"
          color="#10B981"
          tasks={completed}
          onReminder={handleReminder}
        />

        {filtered.length === 0 && helpRequests.length === 0 ? (
          <View className="items-center rounded-xl bg-white p-6">
            <Ionicons name="checkmark-circle-outline" size={48} color="#2E7D5E" />
            <Text className="mt-3 text-center text-[#757575]">No tasks match your filters.</Text>
          </View>
        ) : null}

        <Button className="mt-4 h-12 bg-[#FFD700]" onPress={() => setAddModalOpen(true)}>
          <Text className="font-bold text-black">+ Add task to your profile</Text>
        </Button>
      </ScrollView>

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
