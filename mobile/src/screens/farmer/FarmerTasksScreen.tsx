import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { getFarmerAssignedTasks } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerInboxHeaderBar } from '../../components/messaging/FarmerInboxHeaderBar';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import type { FarmerTaskRow } from '../../components/farmer/FarmerProjectTasksSection';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import {
  categorizeTasks,
  isTaskOverdue,
  pickCategorizedTasks,
  type TaskCategoryFilter,
} from '../../utils/taskCategorization';
import { formatDisplayDate, formatCleanDate } from '../../utils/greeting';
import { useCurrency } from '../../context/CurrencyContext';
import type { FarmerTabParamList } from '../../navigation/types';

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;

type ExtendedTaskRow = FarmerTaskRow & {
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  source?: 'hierarchy' | 'agent_assignment';
};

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

function displayStatus(status: string): string {
  const s = normalizeTaskStatus(status);
  if (s === 'submitted-for-approval') return 'Submitted for Approval';
  return taskStatusLabel(s);
}

function statusVariant(status: string) {
  return taskStatusVariant(normalizeTaskStatus(status));
}

function isOverdue(due?: string | null, status?: string): boolean {
  return isTaskOverdue(due, status);
}

export function FarmerTasksScreen() {
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation();
  const statusFilter = route.params?.statusFilter;
  const scrollTargetId = route.params?.taskId ?? route.params?.highlightTaskId;
  const listRef = useRef<SectionList>(null);
  const { formatAmount } = useCurrency();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);

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
      setLoading(tasks.length === 0);
      load();
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load, tasks.length])
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
        `Status: ${displayStatus(item.status)}`,
      ].join('\n\n')
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const categorized = useMemo(() => categorizeTasks(tasks), [tasks]);
  const displayCategories = useMemo(
    () =>
      statusFilter
        ? pickCategorizedTasks(categorized, statusFilter as TaskCategoryFilter)
        : categorized,
    [categorized, statusFilter]
  );

  const categoryCounts = useMemo(() => ({
    overdue: categorized.overdue.length,
    inProgress: categorized.inProgress.length,
    notStarted: categorized.notStarted.length,
    completed: categorized.completed.length,
  }), [categorized]);

  const sections = useMemo(() => {
    const list: Array<{ title: string; data: ExtendedTaskRow[] }> = [];
    if (displayCategories.overdue.length > 0) {
      list.push({
        title: `OVERDUE (${displayCategories.overdue.length})`,
        data: displayCategories.overdue,
      });
    }
    if (displayCategories.inProgress.length > 0) {
      list.push({
        title: `IN PROGRESS (${displayCategories.inProgress.length})`,
        data: displayCategories.inProgress,
      });
    }
    if (displayCategories.notStarted.length > 0) {
      list.push({
        title: `NOT STARTED (${displayCategories.notStarted.length})`,
        data: displayCategories.notStarted,
      });
    }
    if (displayCategories.completed.length > 0) {
      list.push({
        title: `COMPLETED (${displayCategories.completed.length})`,
        data: displayCategories.completed,
      });
    }
    return list;
  }, [displayCategories]);

  useEffect(() => {
    if (!scrollTargetId || loading || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === scrollTargetId);
    if (!task) return;

    if (sections.length > 0) {
      for (let si = 0; si < sections.length; si++) {
        const ti = sections[si].data.findIndex((t) => t.id === scrollTargetId);
        if (ti >= 0) {
          setTimeout(() => {
            listRef.current?.scrollToLocation({
              sectionIndex: si,
              itemIndex: ti,
              viewOffset: 80,
            });
          }, 400);
          break;
        }
      }
    }

    if (isAgentAssignment(task)) {
      showAgentTaskDetail(task);
    } else if (canOpenTask(task.status)) {
      setSubmitTask(task);
    }
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined });
  }, [scrollTargetId, tasks, loading, navigation, sections]);

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

  const renderTask = (item: ExtendedTaskRow) => {
    const agentTask = isAgentAssignment(item);
    const openable = !agentTask && canOpenTask(item.status);
    const overdue = isOverdue(item.due_date, item.status);
    const assignedWhen = formatDisplayDate(item.assigned_at);
    const deadline = item.due_date ? formatCleanDate(item.due_date) : 'No deadline set';
    const assigner = item.assigned_by_name?.trim() || 'Program team';
    const highlighted = scrollTargetId === item.id;

    return (
      <KBCard
        elevated={false}
        onPress={
          agentTask
            ? () => showAgentTaskDetail(item)
            : openable
              ? () => setSubmitTask(item)
              : undefined
        }
        style={[
          styles.card,
          highlighted ? { borderWidth: 2, borderColor: COLORS.primary } : null,
        ]}
      >
        <View style={styles.row}>
          <View style={styles.titleCol}>
            <Text className="text-lg font-bold text-foreground">{item.name}</Text>
            {item.program_project_name ? (
              <Text className="mt-1 text-sm text-muted-foreground">{item.program_project_name}</Text>
            ) : null}
          </View>
          <KBStatusChip label={displayStatus(item.status)} variant={statusVariant(item.status)} />
        </View>

        {item.description ? (
          <Text className="mt-2 text-sm text-foreground leading-5">{item.description}</Text>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text className="text-xs font-semibold text-muted-foreground">Assigned</Text>
            <Text className="text-sm text-foreground">{assignedWhen}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text className="text-xs font-semibold text-muted-foreground">By</Text>
            <Text className="text-sm text-foreground">{assigner}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text className="text-xs font-semibold text-muted-foreground">Deadline</Text>
            <Text className="text-sm" style={{ color: overdue ? COLORS.alert : COLORS.text }}>
              {deadline}
              {overdue ? ' · Overdue' : ''}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text className="text-xs font-semibold text-muted-foreground">Payment</Text>
            <Text className="text-sm font-semibold" style={{ color: COLORS.accent }}>
              {agentTask ? '—' : formatAmount(item.payment_value_kes ?? 0)}
            </Text>
          </View>
        </View>

        {agentTask ? (
          <Text className="mt-2 text-sm text-muted-foreground">
            Assigned by your field agent — tap for details
          </Text>
        ) : null}

        {normalizeTaskStatus(item.status) === 'rejected' && item.rejection_reason ? (
          <Text className="mt-2 text-sm text-destructive">{item.rejection_reason}</Text>
        ) : null}

        {normalizeTaskStatus(item.status) === 'submitted-for-approval' ? (
          <Text className="mt-2 text-sm italic text-blue-600">
            Awaiting approval — we check status every 30 seconds
          </Text>
        ) : null}

        {openable ? (
          <Button
            mode="contained"
            buttonColor={
              normalizeTaskStatus(item.status) === 'rejected' ? COLORS.warning : COLORS.primary
            }
            onPress={() => setSubmitTask(item)}
            style={styles.openBtn}
          >
            {normalizeTaskStatus(item.status) === 'rejected' ? 'Resubmit task' : 'Open task'}
          </Button>
        ) : null}
      </KBCard>
    );
  };

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
      <SectionList
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text className="text-2xl font-bold text-foreground">Your Tasks</Text>
            {filterLabel ? (
              <Text className="mt-1 text-sm font-semibold text-[#4472C4]">{filterLabel}</Text>
            ) : null}
            <Text className="mt-1 text-sm text-muted-foreground">
              {categoryCounts.overdue} overdue · {categoryCounts.inProgress} in progress ·{' '}
              {categoryCounts.notStarted} not started · {categoryCounts.completed} completed · updates every 30s
            </Text>
            {error ? <FarmerOfflineBanner message={error} /> : null}
          </View>
        }
        ListEmptyComponent={
          !error ? (
            <KBCard elevated={false}>
              <Text className="text-base text-muted-foreground text-center">
                {statusFilter
                  ? 'No tasks match this filter.'
                  : 'You have no assigned tasks yet. New assignments from your field agent or program team will appear here.'}
              </Text>
            </KBCard>
          ) : null
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text className="mb-2 mt-3 text-sm font-bold uppercase tracking-wide text-[#757575]">
            {title}
          </Text>
        )}
        renderItem={({ item }) => renderTask(item)}
      />

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
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleCol: {
    flex: 1,
  },
  metaGrid: {
    marginTop: 12,
    gap: 10,
  },
  metaItem: {
    gap: 2,
  },
  openBtn: {
    marginTop: 12,
  },
});
