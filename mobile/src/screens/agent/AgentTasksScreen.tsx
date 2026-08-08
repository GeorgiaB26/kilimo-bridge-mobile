import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
  Platform,
  Modal,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  approveFarmerTask,
  createAgentPersonalTask,
  getAgentHelpRequests,
  getAgentTasks,
  rejectFarmerTask,
  resolveAgentHelpRequest,
  updateAgentPersonalTask,
} from '../../api/client';
import { api } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import {
  categorizeTasks,
  flattenCategorizedBuckets,
  pickCategorizedTasks,
  type TaskCategoryFilter,
} from '../../utils/taskCategorization';
import type { AgentTabParamList } from '../../navigation/types';
import { KBCard } from '../../components/ui/KBCard';
import { AddAgentTaskModal } from '../../components/agent/AddAgentTaskModal';
import { AgentTaskDetailModal, type AgentTaskDetail } from '../../components/agent/AgentTaskDetailModal';
import { checkAndShowTaskReminders } from '../../utils/taskReminders';
import { TasksSummaryCards } from '../../components/tasks/TasksSummaryCards';
import { TasksTableView, type TaskTableRow } from '../../components/tasks/TasksTableView';
import { TasksSearchToolbar } from '../../components/tasks/TasksSearchToolbar';

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
  priority?: string;
  description?: string | null;
  assigned_farmer_names?: string[];
  assigned_farmer_ids?: string[];
};

type FilterKey = 'all' | TaskCategoryFilter;
type AssigneeFilter = 'all' | 'me' | string;

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AgentTaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updatingTask, setUpdatingTask] = useState(false);

  const mapPersonalTask = (t: Record<string, unknown>): UnifiedTask => {
    const ids = Array.isArray(t.assigned_farmer_ids)
      ? (t.assigned_farmer_ids as string[])
      : typeof t.assigned_farmer_ids === 'string'
        ? tryParseIds(t.assigned_farmer_ids as string)
        : [];
    return {
      id: String(t.id),
      name: String(t.name ?? ''),
      status: String(t.status ?? 'not_started'),
      due_date: t.due_date as string | null,
      priority: t.priority as string | undefined,
      description: t.description as string | null | undefined,
      assigned_farmer_names: Array.isArray(t.assigned_farmer_names)
        ? (t.assigned_farmer_names as string[])
        : undefined,
      assigned_farmer_ids: ids.length ? ids : undefined,
      source: 'personal' as const,
    };
  };

  function tryParseIds(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  const toTaskDetail = (task: UnifiedTask): AgentTaskDetail => ({
    id: task.id,
    name: task.name,
    status: task.status,
    due_date: task.due_date,
    description: task.description,
    farmer_name: task.farmer_name ?? task.assigned_farmer_names?.join(', '),
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
        farmer_id: t.farmer_id as string | undefined,
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
      /* keep existing */
    }

    try {
      const helpData = await getAgentHelpRequests();
      setHelpRequests(helpData.requests ?? []);
    } catch {
      /* keep */
    }

    try {
      const farmersRes = await api.get('/agents/farmers');
      setFarmers((farmersRes.data.farmers ?? []).map((f: { farmer_id: string; name: string }) => ({
        farmer_id: f.farmer_id,
        name: f.name,
      })));
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const routeFilter = route.params?.filter;
      if (routeFilter) {
        setStatusFilter(routeFilter);
        navigation.setParams({ filter: undefined });
      }
      if (route.params?.openAdd) {
        setAddModalOpen(true);
        navigation.setParams({ openAdd: undefined });
      }
      load();
      checkAndShowTaskReminders();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load, navigation, route.params?.filter, route.params?.openAdd])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const allTasks = useMemo(() => [...farmerTasks, ...personalTasks], [farmerTasks, personalTasks]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTasks;
    return allTasks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.farmer_name?.toLowerCase().includes(q) ?? false) ||
        (t.program_project_name?.toLowerCase().includes(q) ?? false) ||
        (t.assigned_farmer_names?.some((n) => n.toLowerCase().includes(q)) ?? false)
    );
  }, [allTasks, search]);

  const assigneeFiltered = useMemo(() => {
    if (assigneeFilter === 'all') return searchFiltered;
    if (assigneeFilter === 'me') {
      return searchFiltered.filter((t) => t.source === 'personal');
    }
    return searchFiltered.filter(
      (t) =>
        t.farmer_id === assigneeFilter ||
        (t.assigned_farmer_ids?.includes(assigneeFilter) ?? false)
    );
  }, [searchFiltered, assigneeFilter]);

  const categorized = useMemo(() => categorizeTasks(assigneeFiltered), [assigneeFiltered]);
  const displayCategories = useMemo(
    () => pickCategorizedTasks(categorized, statusFilter),
    [categorized, statusFilter]
  );

  const tableTasks = useMemo(
    () => flattenCategorizedBuckets(displayCategories),
    [displayCategories]
  );

  const tableRows: TaskTableRow[] = useMemo(
    () =>
      tableTasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        due_date: t.due_date,
        assigneeLabel:
          t.source === 'personal'
            ? t.assigned_farmer_names?.join(', ') || 'You'
            : t.farmer_name ?? '—',
        projectLabel:
          t.program_project_name ??
          (t.source === 'personal' ? 'Personal task' : '—'),
      })),
    [tableTasks]
  );

  const assigneeLabel = useMemo(() => {
    if (assigneeFilter === 'all') return 'All assignees';
    if (assigneeFilter === 'me') return 'My tasks';
    return farmers.find((f) => f.farmer_id === assigneeFilter)?.name ?? 'Farmer';
  }, [assigneeFilter, farmers]);

  const statusFilterLabel = useMemo(() => {
    if (statusFilter === 'all') return 'All statuses';
    return statusFilter.replace(/_/g, ' ').toUpperCase();
  }, [statusFilter]);

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
      await createAgentPersonalTask(data);
      setStatusFilter('all');
      setAssigneeFilter('all');
      setSearch('');
      await load();
      setAddModalOpen(false);
      showMessage('Task created', 'Your task is now in the Tasks list.');
    } catch (err: unknown) {
      showMessage('Could not create task', extractApiError(err, 'Could not create task'));
      throw err;
    } finally {
      setCreating(false);
    }
  };

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

  const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

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
        contentContainerClassName="pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-4 pt-4">
          <Pressable
            onPress={() => setAddModalOpen(true)}
            className="mb-0 h-12 items-center justify-center rounded-lg bg-[#FFD700]"
            style={webPressable}
          >
            <Text className="font-bold text-black">+ Create task</Text>
          </Pressable>
        </View>

        <TasksSummaryCards
          tasks={assigneeFiltered}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        <TasksSearchToolbar
          search={search}
          onSearchChange={setSearch}
          filterButtons={[
            {
              key: 'status',
              label: statusFilterLabel,
              active: statusFilter !== 'all',
              onPress: () => setFilterModalOpen(true),
            },
            {
              key: 'assignee',
              label: assigneeLabel,
              active: assigneeFilter !== 'all',
              onPress: () => setFilterModalOpen(true),
            },
          ]}
        />

        <TasksTableView
          rows={tableRows}
          onRowPress={(row) => {
            const task = tableTasks.find((t) => t.id === row.id);
            if (task) openTaskDetail(task);
          }}
          emptyMessage="No tasks match your filters."
        />

        {helpRequests.length > 0 ? (
          <View className="mx-4 mt-4">
            <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
              Farmer help requests
            </Text>
            {helpRequests.map((item) => (
              <KBCard key={item.id} style={{ marginBottom: 8 }}>
                <Text className="font-bold text-[#333333]">{item.farmer_name}</Text>
                <Text className="text-sm text-[#757575]">{item.message}</Text>
                <Button
                  className="mt-2 h-10 bg-[#1A4D3E]"
                  onPress={() => markContacted(item.id)}
                  disabled={acting === item.id}
                >
                  <Text className="text-white">Mark contacted</Text>
                </Button>
              </KBCard>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={filterModalOpen} transparent animationType="slide" onRequestClose={() => setFilterModalOpen(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-2xl bg-white px-4 py-5">
            <Text className="mb-3 text-lg font-bold text-[#333333]">Filter tasks</Text>

            <Text className="mb-2 text-sm font-semibold text-[#333333]">Status</Text>
            {(['all', 'overdue', 'in_progress', 'not_started', 'completed'] as FilterKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => {
                  setStatusFilter(key);
                }}
                className="py-2.5"
                style={webPressable}
              >
                <Text
                  className={`text-sm ${statusFilter === key ? 'font-bold text-[#4472C4]' : 'text-[#666666]'}`}
                >
                  {key === 'all' ? 'All statuses' : key.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}

            <Text className="mb-2 mt-4 text-sm font-semibold text-[#333333]">Assignee</Text>
            <Pressable onPress={() => setAssigneeFilter('all')} className="py-2.5" style={webPressable}>
              <Text className={`text-sm ${assigneeFilter === 'all' ? 'font-bold text-[#4472C4]' : 'text-[#666666]'}`}>
                All assignees
              </Text>
            </Pressable>
            <Pressable onPress={() => setAssigneeFilter('me')} className="py-2.5" style={webPressable}>
              <Text className={`text-sm ${assigneeFilter === 'me' ? 'font-bold text-[#4472C4]' : 'text-[#666666]'}`}>
                My tasks
              </Text>
            </Pressable>
            {farmers.map((f) => (
              <Pressable
                key={f.farmer_id}
                onPress={() => setAssigneeFilter(f.farmer_id)}
                className="py-2.5"
                style={webPressable}
              >
                <Text
                  className={`text-sm ${assigneeFilter === f.farmer_id ? 'font-bold text-[#4472C4]' : 'text-[#666666]'}`}
                >
                  {f.name}
                </Text>
              </Pressable>
            ))}

            <Button className="mt-4 h-11 bg-[#4472C4]" onPress={() => setFilterModalOpen(false)}>
              <Text className="text-white">Close</Text>
            </Button>
          </View>
        </View>
      </Modal>

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
