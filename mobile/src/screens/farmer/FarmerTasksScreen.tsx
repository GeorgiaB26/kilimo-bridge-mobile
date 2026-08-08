import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getFarmerAssignedTasks } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerInboxHeaderBar } from '../../components/messaging/FarmerInboxHeaderBar';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import type { FarmerTaskRow } from '../../components/farmer/FarmerProjectTasksSection';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import { formatCleanDate } from '../../utils/greeting';
import {
  categorizeTasks,
  flattenCategorizedBuckets,
  pickCategorizedTasks,
  type TaskCategoryFilter,
} from '../../utils/taskCategorization';
import type { FarmerTabParamList } from '../../navigation/types';
import { TasksSummaryCards } from '../../components/tasks/TasksSummaryCards';
import { TasksTableView, farmerTaskColumns, type TaskTableRow } from '../../components/tasks/TasksTableView';
import { TasksSearchToolbar } from '../../components/tasks/TasksSearchToolbar';

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;

type ExtendedTaskRow = FarmerTaskRow & {
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  source?: 'hierarchy' | 'agent_assignment';
};

type FilterKey = 'all' | TaskCategoryFilter;

function isAgentAssignment(task: ExtendedTaskRow): boolean {
  return task.source === 'agent_assignment';
}

function normalizeTaskStatus(status: string): string {
  return status.replace(/_/g, '-');
}

function canOpenTask(status: string): boolean {
  const s = normalizeTaskStatus(status);
  return ['not-started', 'in-progress', 'rejected'].includes(s);
}

export function FarmerTasksScreen() {
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation();
  const statusFilterFromRoute = route.params?.statusFilter;
  const scrollTargetId = route.params?.taskId ?? route.params?.highlightTaskId;
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterKey>(
    statusFilterFromRoute ?? 'all'
  );

  const load = useCallback(async () => {
    try {
      const data = await getFarmerAssignedTasks();
      const list = (data.tasks ?? []) as ExtendedTaskRow[];
      setTasks(list);
      setError(null);
    } catch (err: unknown) {
      setTasks([]);
      setError(extractApiError(err, 'Could not load tasks'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (statusFilterFromRoute) {
        setStatusFilter(statusFilterFromRoute);
      }
      setLoading(tasks.length === 0);
      load();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load, statusFilterFromRoute, tasks.length])
  );

  useTaskApprovalPolling(
    tasks.filter((t) => !isAgentAssignment(t)),
    load
  );

  const showAgentTaskDetail = (item: ExtendedTaskRow) => {
    const assigner = item.assigned_by_name?.trim() || 'Your field agent';
    const deadline = item.due_date ? formatCleanDate(item.due_date) : 'No deadline set';
    Alert.alert(
      item.name,
      [
        item.description?.trim() || 'No description provided.',
        `Assigned by: ${assigner}`,
        `Due: ${deadline}`,
        `Status: ${item.status.replace(/_/g, ' ')}`,
      ].join('\n\n')
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.program_project_name?.toLowerCase().includes(q) ?? false) ||
        (t.assigned_by_name?.toLowerCase().includes(q) ?? false)
    );
  }, [tasks, search]);

  const categorized = useMemo(() => categorizeTasks(searchFiltered), [searchFiltered]);
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
        assigneeLabel: t.assigned_by_name?.trim() || 'Program team',
        projectLabel: t.program_project_name ?? (isAgentAssignment(t) ? 'Field agent assignment' : '—'),
      })),
    [tableTasks]
  );

  useEffect(() => {
    if (!scrollTargetId || loading || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === scrollTargetId);
    if (!task) return;

    if (isAgentAssignment(task)) {
      showAgentTaskDetail(task);
    } else if (canOpenTask(task.status)) {
      setSubmitTask(task);
    }
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined } as never);
  }, [scrollTargetId, tasks, loading, navigation]);

  const handleRowPress = (row: TaskTableRow) => {
    const task = tableTasks.find((t) => t.id === row.id);
    if (!task) return;
    if (isAgentAssignment(task)) {
      showAgentTaskDetail(task);
      return;
    }
    if (canOpenTask(task.status)) {
      setSubmitTask(task);
    }
  };

  const filterLabel =
    statusFilter === 'overdue'
      ? 'Overdue tasks'
      : statusFilter === 'in_progress'
        ? 'In progress tasks'
        : statusFilter === 'not_started'
          ? 'Not started tasks'
          : statusFilter === 'completed'
            ? 'Completed tasks'
            : null;

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.root}>
        <FarmerInboxHeaderBar />
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text className="mt-3 text-muted-foreground">Loading your tasks...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FarmerInboxHeaderBar />
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.header}>
          <Text className="text-2xl font-bold text-foreground">Your Tasks</Text>
          {filterLabel ? (
            <Text className="mt-1 text-sm font-semibold text-[#4472C4]">{filterLabel}</Text>
          ) : null}
          <Text className="mt-1 text-sm text-muted-foreground">
            Updates every 30 seconds · overdue tasks shown first
          </Text>
          {error ? <FarmerOfflineBanner message={error} /> : null}
        </View>

        <TasksSummaryCards
          tasks={searchFiltered}
          activeFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        <TasksSearchToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search task, project or assignee"
        />

        <TasksTableView
          rows={tableRows}
          columns={farmerTaskColumns}
          onRowPress={handleRowPress}
          highlightId={scrollTargetId}
          emptyMessage={
            statusFilter !== 'all'
              ? 'No tasks match this filter.'
              : 'You have no assigned tasks yet. New assignments from your field agent or program team will appear here.'
          }
        />
      </ScrollView>

      <FarmerTaskSubmitModal
        task={submitTask && !isAgentAssignment(submitTask) ? submitTask : null}
        visible={!!submitTask}
        onClose={() => setSubmitTask(null)}
        onSubmitted={async () => {
          setSubmitTask(null);
          await load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: {
    paddingBottom: 100,
  },
  header: {
    marginBottom: 0,
    marginTop: 4,
    paddingHorizontal: 16,
  },
});
