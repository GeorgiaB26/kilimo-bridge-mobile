import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { getFarmerAssignedTasks } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerInboxHeaderBar } from '../../components/messaging/FarmerInboxHeaderBar';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import { OutboxTaskRecallCard } from '../../components/OutboxTaskRecallCard';
import { OutboxTaskStartCard } from '../../components/OutboxTaskStartCard';
import {
  TaskStatusKpiRow,
  type TaskStatusKpiKey,
} from '../../components/TaskStatusKpiRow';
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
import {
  dismissTaskRecallOutbox,
  listPendingTaskRecalls,
  pushPendingTaskRecall,
  recallFarmerTaskWithOutbox,
  syncAllPendingTaskRecalls,
  type PendingTaskRecallView,
} from '../../services/submitTaskRecallOutbox';
import {
  dismissTaskStartOutbox,
  listPendingTaskStarts,
  pushPendingTaskStart,
  startFarmerTaskWithOutbox,
  syncAllPendingTaskStarts,
  type PendingTaskStartView,
} from '../../services/submitTaskStartOutbox';

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;
type StatusFilterKey = TaskStatusKpiKey;

/** Show Project / Start / End columns at this width and above. */
const WIDE_TABLE_MIN_WIDTH = 600;

type ExtendedTaskRow = FarmerTaskRow & {
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  source?: 'hierarchy' | 'agent_assignment';
  notes?: string | null;
  photo_evidence_key?: string | null;
  farmer_started_at?: string | null;
};

function evidencePhotoUri(item: ExtendedTaskRow): string | null {
  const url = (item.photo_evidence_url ?? item.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

function shouldShowSubmissionEvidence(status: string): boolean {
  const s = normalizeTaskStatus(status);
  return (
    s === 'submitted' ||
    s === 'submitted-for-approval' ||
    s === 'approved' ||
    s === 'completed' ||
    s === 'rejected'
  );
}

function isAgentAssignment(task: ExtendedTaskRow): boolean {
  return task.source === 'agent_assignment';
}

function normalizeTaskStatus(status: string): string {
  return status.replace(/_/g, '-');
}

function canStartTask(status: string): boolean {
  return normalizeTaskStatus(status) === 'not-started';
}

/** Edit (evidence) for in-progress / rejected; recall+edit for submitted. */
function canEditTask(status: string): boolean {
  const s = normalizeTaskStatus(status);
  return s === 'in-progress' || s === 'rejected' || isSubmittedForApproval(s);
}

function isSubmittedForApproval(status: string): boolean {
  const s = normalizeTaskStatus(status);
  return s === 'submitted-for-approval' || s === 'submitted';
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

function projectLabel(item: ExtendedTaskRow): string {
  if (item.program_project_name?.trim()) return item.program_project_name.trim();
  if (isAgentAssignment(item)) return 'Field agent assignment';
  return '—';
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const probe = new Date(`${value}T12:00:00`);
  return !Number.isNaN(probe.getTime());
}

export function FarmerTasksScreen() {
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation<NavigationProp<FarmerTabParamList>>();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_TABLE_MIN_WIDTH;
  const statusFilter = route.params?.statusFilter;
  const scrollTargetId = route.params?.taskId ?? route.params?.highlightTaskId;
  const { formatAmount } = useCurrency();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);
  const [detailTask, setDetailTask] = useState<ExtendedTaskRow | null>(null);
  const [startTask, setStartTask] = useState<ExtendedTaskRow | null>(null);
  const [startDateInput, setStartDateInput] = useState(todayYmd());
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pendingStarts, setPendingStarts] = useState<PendingTaskStartView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [pushingStartId, setPushingStartId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const loadPendingRecalls = useCallback(async () => {
    setPendingRecalls(await listPendingTaskRecalls());
  }, []);

  const loadPendingStarts = useCallback(async () => {
    setPendingStarts(await listPendingTaskStarts());
  }, []);

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
      void (async () => {
        await syncAllPendingTaskStarts();
        await syncAllPendingTaskRecalls();
        await loadPendingStarts();
        await loadPendingRecalls();
        await load();
      })();
      const interval = setInterval(() => {
        void load();
        void loadPendingRecalls();
        void loadPendingStarts();
      }, 30000);
      return () => clearInterval(interval);
    }, [load, loadPendingRecalls, loadPendingStarts, tasks.length])
  );

  useTaskApprovalPolling(tasks, load);

  const onRefresh = () => {
    setRefreshing(true);
    void (async () => {
      await syncAllPendingTaskStarts();
      await syncAllPendingTaskRecalls();
      await loadPendingStarts();
      await loadPendingRecalls();
      await load();
    })();
  };

  const handleRecall = async (item: ExtendedTaskRow) => {
    setRecallingId(item.id);
    try {
      const result = await recallFarmerTaskWithOutbox({
        taskId: item.id,
        taskName: item.name,
        source: item.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
        expectedStatus: item.status || 'submitted-for-approval',
      });
      await loadPendingRecalls();
      if (result.mode === 'online') {
        showMessage(
          'Submission recalled',
          'Your photo and notes are still saved. Edit and resubmit when ready.'
        );
        await load();
        setDetailTask(null);
        setSubmitTask({ ...item, status: 'in-progress' });
        return;
      }
      if (result.mode === 'offline') {
        showMessage(
          'Recall saved offline',
          'We will push your recall when you are back online. Open Your Tasks to push manually.'
        );
        setDetailTask(null);
        return;
      }
      showMessage('Needs your review', result.error);
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not recall task'));
    } finally {
      setRecallingId(null);
    }
  };

  const confirmAndRecall = (item: ExtendedTaskRow) => {
    Alert.alert(
      'Withdraw submission?',
      'This will withdraw your submission from review so you can edit it — continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => void handleRecall(item),
        },
      ]
    );
  };

  const handleEdit = (item: ExtendedTaskRow) => {
    if (!canEditTask(item.status)) return;
    if (isSubmittedForApproval(item.status)) {
      confirmAndRecall(item);
      return;
    }
    setDetailTask(null);
    setSubmitTask(item);
  };

  const openStartModal = (item: ExtendedTaskRow) => {
    setStartDateInput(todayYmd());
    setStartTask(item);
  };

  const handleConfirmStart = async () => {
    if (!startTask) return;
    const date = startDateInput.trim();
    if (!isValidYmd(date)) {
      showMessage('Invalid date', 'Enter start date as YYYY-MM-DD.');
      return;
    }
    const today = todayYmd();
    if (date > today) {
      showMessage('Invalid date', 'Start date cannot be in the future.');
      return;
    }

    setStartingId(startTask.id);
    try {
      const result = await startFarmerTaskWithOutbox({
        taskId: startTask.id,
        taskName: startTask.name,
        source: startTask.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
        startDate: date,
        expectedStatus: startTask.status || 'not-started',
      });
      await loadPendingStarts();
      if (result.mode === 'online') {
        showMessage('Task started', `Start date set to ${date}.`);
        setStartTask(null);
        setDetailTask(null);
        await load();
        return;
      }
      if (result.mode === 'offline') {
        showMessage(
          'Start saved offline',
          'We will push your start when you are back online. Open Your Tasks to push manually.'
        );
        setStartTask(null);
        setDetailTask(null);
        return;
      }
      showMessage('Needs your review', result.error);
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not start task'));
    } finally {
      setStartingId(null);
    }
  };

  const categorized = useMemo(() => categorizeTasks(tasks), [tasks]);
  const displayCategories = useMemo(
    () =>
      statusFilter
        ? pickCategorizedTasks(categorized, statusFilter as TaskCategoryFilter)
        : categorized,
    [categorized, statusFilter]
  );

  const flatTasks = useMemo(
    () => [
      ...displayCategories.overdue,
      ...displayCategories.inProgress,
      ...displayCategories.notStarted,
      ...displayCategories.submittedForApproval,
      ...displayCategories.rejected,
      ...displayCategories.completed,
    ],
    [displayCategories]
  );

  const categoryCounts = useMemo(
    () => ({
      overdue: categorized.overdue.length,
      in_progress: categorized.inProgress.length,
      not_started: categorized.notStarted.length,
      submitted_for_approval: categorized.submittedForApproval.length,
      rejected: categorized.rejected.length,
      completed: categorized.completed.length,
    }),
    [categorized]
  );

  useEffect(() => {
    if (statusFilter === 'rejected' && categoryCounts.rejected === 0) {
      navigation.setParams({ statusFilter: undefined });
    }
    if (
      statusFilter === 'submitted_for_approval' &&
      categoryCounts.submitted_for_approval === 0
    ) {
      navigation.setParams({ statusFilter: undefined });
    }
  }, [
    statusFilter,
    categoryCounts.rejected,
    categoryCounts.submitted_for_approval,
    navigation,
  ]);

  const toggleStatusFilter = (key: StatusFilterKey) => {
    navigation.setParams({
      statusFilter: statusFilter === key ? undefined : key,
    });
  };

  useEffect(() => {
    if (!scrollTargetId || loading || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === scrollTargetId);
    if (!task) return;

    setDetailTask(task);
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined });
  }, [scrollTargetId, tasks, loading, navigation]);

  const renderActionButton = (item: ExtendedTaskRow, compact = true) => {
    if (canStartTask(item.status)) {
      if (!compact) {
        return (
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            loading={startingId === item.id}
            disabled={startingId === item.id}
            onPress={() => openStartModal(item)}
            style={styles.openBtn}
          >
            Start Task
          </Button>
        );
      }
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start task ${item.name}`}
          disabled={startingId === item.id}
          onPress={(e) => {
            e?.stopPropagation?.();
            openStartModal(item);
          }}
          style={({ pressed }) => [
            styles.actionChip,
            startingId === item.id || pressed ? styles.actionChipPressed : null,
          ]}
        >
          {startingId === item.id ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.actionChipLabel} numberOfLines={1}>
              Start Task
            </Text>
          )}
        </Pressable>
      );
    }
    if (canEditTask(item.status)) {
      if (!compact) {
        return (
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            loading={recallingId === item.id}
            disabled={recallingId === item.id}
            onPress={() => handleEdit(item)}
            style={styles.openBtn}
          >
            Edit
          </Button>
        );
      }
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit task ${item.name}`}
          disabled={recallingId === item.id}
          onPress={(e) => {
            e?.stopPropagation?.();
            handleEdit(item);
          }}
          style={({ pressed }) => [
            styles.actionChip,
            recallingId === item.id || pressed ? styles.actionChipPressed : null,
          ]}
        >
          {recallingId === item.id ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.actionChipLabel} numberOfLines={1}>
              Edit
            </Text>
          )}
        </Pressable>
      );
    }
    return compact ? (
      <Text style={styles.actionsMuted}>—</Text>
    ) : (
      <Text className="mt-3 text-sm text-muted-foreground">Task locked — no further edits</Text>
    );
  };

  const colTask = wide ? styles.colTaskWide : styles.colTaskNarrow;
  const colStatus = wide ? styles.colStatusWide : styles.colStatusNarrow;
  const colActions = wide ? styles.colActionsWide : styles.colActionsNarrow;

  const renderTableHeader = () => (
    <View style={[styles.tableHeader, wide ? styles.tableHeaderWide : null]}>
      <Text style={[styles.th, colTask]} numberOfLines={1}>
        Task
      </Text>
      {wide ? (
        <>
          <Text style={[styles.th, styles.colProject]} numberOfLines={1}>
            Project
          </Text>
          <Text style={[styles.th, styles.colDate]} numberOfLines={1}>
            Start
          </Text>
          <Text style={[styles.th, styles.colDate]} numberOfLines={1}>
            End
          </Text>
        </>
      ) : null}
      <Text style={[styles.th, colStatus]} numberOfLines={1}>
        Status
      </Text>
      <Text style={[styles.th, colActions]} numberOfLines={1}>
        Actions
      </Text>
    </View>
  );

  const renderTask = (item: ExtendedTaskRow, index: number, total: number) => {
    const overdue = isOverdue(item.due_date, item.status);
    const startDate = item.farmer_started_at
      ? formatCleanDate(item.farmer_started_at)
      : '—';
    const endDate = item.due_date ? formatCleanDate(item.due_date) : '—';
    const highlighted = scrollTargetId === item.id;
    const project = projectLabel(item);
    const last = index === total - 1;

    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Open details for ${item.name}`}
        onPress={() => setDetailTask(item)}
        style={({ pressed }) => [
          styles.tableRow,
          wide ? styles.tableRowWide : null,
          !last ? styles.tableRowBorder : null,
          highlighted ? styles.tableRowHighlighted : null,
          pressed ? styles.tableRowPressed : null,
        ]}
      >
        <View style={[colTask, styles.taskCell]}>
          <Text style={styles.taskName} numberOfLines={2}>
            {item.name}
          </Text>
          {!wide ? (
            <Text style={styles.taskProjectMuted} numberOfLines={1}>
              {project}
            </Text>
          ) : null}
        </View>

        {wide ? (
          <>
            <Text style={[styles.td, styles.colProject]} numberOfLines={2}>
              {project}
            </Text>
            <Text style={[styles.td, styles.colDate]} numberOfLines={1}>
              {startDate}
            </Text>
            <Text
              style={[styles.td, styles.colDate, overdue ? styles.dateOverdue : null]}
              numberOfLines={1}
            >
              {endDate}
            </Text>
          </>
        ) : null}

        <View style={[colStatus, styles.statusCell]}>
          <KBStatusChip
            label={displayStatus(item.status)}
            variant={statusVariant(item.status)}
          />
        </View>

        <View style={[colActions, styles.actionsCell]}>
          {renderActionButton(item, true)}
        </View>
      </Pressable>
    );
  };

  const detail = detailTask;
  const detailOverdue = detail ? isOverdue(detail.due_date, detail.status) : false;
  const detailStart = detail?.farmer_started_at
    ? formatCleanDate(detail.farmer_started_at)
    : '—';
  const detailEnd = detail?.due_date ? formatCleanDate(detail.due_date) : '—';
  const detailPhoto = detail ? evidencePhotoUri(detail) : null;
  const detailNotes = detail?.notes?.trim() || '';

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
          <TaskStatusKpiRow
            counts={categoryCounts}
            selected={statusFilter ?? null}
            onSelect={toggleStatusFilter}
          />
          {statusFilter ? (
            <Text style={styles.filterHint}>Tap the selected card again to show all tasks</Text>
          ) : (
            <Text style={styles.filterHint}>Updates every 30s</Text>
          )}
          {error ? <FarmerOfflineBanner message={error} /> : null}
          {pendingStarts.length > 0 ? (
            <View style={styles.pendingQueue}>
              <Text className="mb-2 text-sm font-semibold text-foreground">
                Queued starts ({pendingStarts.length})
              </Text>
              {pendingStarts.map((item) => (
                <OutboxTaskStartCard
                  key={item.id}
                  item={item}
                  pushing={pushingStartId === item.id}
                  onPush={() => {
                    void (async () => {
                      setPushingStartId(item.id);
                      try {
                        const result = await pushPendingTaskStart(item.id);
                        if (result.success) {
                          showMessage('Start synced', 'Your start date is saved on the server.');
                          await load();
                        } else if (result.needsReview) {
                          showMessage('Needs your review', result.error || 'Conflict detected');
                        } else {
                          showMessage('Sync failed', result.error || 'Could not push start');
                        }
                        await loadPendingStarts();
                      } finally {
                        setPushingStartId(null);
                      }
                    })();
                  }}
                  onDismiss={() => {
                    void (async () => {
                      await dismissTaskStartOutbox(item.id);
                      await loadPendingStarts();
                    })();
                  }}
                />
              ))}
            </View>
          ) : null}
          {pendingRecalls.length > 0 ? (
            <View style={styles.pendingQueue}>
              <Text className="mb-2 text-sm font-semibold text-foreground">
                Queued recalls ({pendingRecalls.length})
              </Text>
              {pendingRecalls.map((item) => (
                <OutboxTaskRecallCard
                  key={item.id}
                  item={item}
                  pushing={pushingRecallId === item.id}
                  onPush={() => {
                    void (async () => {
                      setPushingRecallId(item.id);
                      try {
                        const result = await pushPendingTaskRecall(item.id);
                        if (result.success) {
                          showMessage('Recall synced', 'You can edit and resubmit when ready.');
                          await load();
                        } else if (result.needsReview) {
                          showMessage('Needs your review', result.error || 'Conflict detected');
                        } else {
                          showMessage('Sync failed', result.error || 'Could not push recall');
                        }
                        await loadPendingRecalls();
                      } finally {
                        setPushingRecallId(null);
                      }
                    })();
                  }}
                  onDismiss={() => {
                    void (async () => {
                      await dismissTaskRecallOutbox(item.id);
                      await loadPendingRecalls();
                    })();
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>

        {flatTasks.length === 0 ? (
          !error ? (
            <KBCard elevated={false}>
              <Text className="text-base text-muted-foreground text-center">
                {statusFilter
                  ? 'No tasks match this filter.'
                  : 'You have no assigned tasks yet. New assignments from your field agent or program team will appear here.'}
              </Text>
            </KBCard>
          ) : null
        ) : (
          <View style={styles.tableShell}>
            {renderTableHeader()}
            {flatTasks.map((item, index) => renderTask(item, index, flatTasks.length))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!detail}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailTask(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text className="text-xl font-bold text-foreground">{detail?.name}</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                {detail ? projectLabel(detail) : ''}
              </Text>
              <View style={styles.modalChipRow}>
                {detail ? (
                  <KBStatusChip
                    label={displayStatus(detail.status)}
                    variant={statusVariant(detail.status)}
                  />
                ) : null}
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <Text className="text-xs font-semibold text-muted-foreground">Start date</Text>
                  <Text className="text-sm text-foreground">{detailStart}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text className="text-xs font-semibold text-muted-foreground">End date</Text>
                  <Text
                    className="text-sm"
                    style={{ color: detailOverdue ? COLORS.alert : COLORS.text }}
                  >
                    {detailEnd}
                    {detailOverdue ? ' · Overdue' : ''}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text className="text-xs font-semibold text-muted-foreground">Assigned</Text>
                  <Text className="text-sm text-foreground">
                    {detail ? formatDisplayDate(detail.assigned_at) : '—'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text className="text-xs font-semibold text-muted-foreground">By</Text>
                  <Text className="text-sm text-foreground">
                    {detail?.assigned_by_name?.trim() ||
                      (detail && isAgentAssignment(detail)
                        ? 'Your field agent'
                        : 'Program team')}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Text className="text-xs font-semibold text-muted-foreground">Payment</Text>
                  <Text className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                    {detail && isAgentAssignment(detail)
                      ? '—'
                      : formatAmount(detail?.payment_value_kes ?? 0)}
                  </Text>
                </View>
              </View>

              {detail?.description ? (
                <Text className="mt-3 text-sm leading-5 text-foreground">{detail.description}</Text>
              ) : null}

              {detail && shouldShowSubmissionEvidence(detail.status) ? (
                <View style={styles.evidenceBlock}>
                  <Text className="mb-2 text-sm font-semibold text-foreground">Your submission</Text>
                  {detailNotes ? (
                    <Text className="text-sm leading-5 text-foreground">{detailNotes}</Text>
                  ) : (
                    <Text className="text-sm text-muted-foreground">No notes provided.</Text>
                  )}
                  {detailPhoto ? (
                    <Image
                      source={{ uri: detailPhoto }}
                      style={styles.evidenceImage}
                      resizeMode="cover"
                      accessibilityLabel={`Evidence photo for ${detail.name}`}
                    />
                  ) : (
                    <Text className="mt-2 text-sm font-semibold text-destructive">Photo required</Text>
                  )}
                </View>
              ) : null}

              {detail &&
              normalizeTaskStatus(detail.status) === 'rejected' &&
              detail.rejection_reason ? (
                <Text className="mt-2 text-sm text-destructive">{detail.rejection_reason}</Text>
              ) : null}

              {detail && isSubmittedForApproval(detail.status) ? (
                <Text className="mt-2 text-sm italic text-blue-600">
                  Awaiting approval — we check status every 30 seconds
                </Text>
              ) : null}

              {detail ? renderActionButton(detail, false) : null}

              <Button mode="text" onPress={() => setDetailTask(null)} style={styles.closeBtn}>
                Close
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!startTask}
        animationType="slide"
        transparent
        onRequestClose={() => setStartTask(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStartTask(null)} />
          <View style={styles.startModalCard}>
            <Text className="text-lg font-bold text-foreground">Start Task</Text>
            <Text className="mt-1 text-sm text-muted-foreground">{startTask?.name}</Text>
            <Text className="mt-4 text-xs font-semibold text-muted-foreground">
              When did you start? (YYYY-MM-DD)
            </Text>
            <TextInput
              value={startDateInput}
              onChangeText={setStartDateInput}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              style={styles.dateInput}
            />
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              loading={!!startingId}
              disabled={!!startingId}
              onPress={() => void handleConfirmStart()}
              style={styles.openBtn}
            >
              Confirm start
            </Button>
            <Button mode="text" onPress={() => setStartTask(null)} disabled={!!startingId}>
              Cancel
            </Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <FarmerTaskSubmitModal
        task={
          submitTask
            ? {
                id: submitTask.id,
                name: submitTask.name,
                description: submitTask.description,
                payment_value_kes: submitTask.payment_value_kes,
                source: submitTask.source ?? 'hierarchy',
                initialNotes: submitTask.notes ?? null,
                initialPhotoUri: evidencePhotoUri(submitTask),
                initialPhotoKey: submitTask.photo_evidence_key ?? null,
              }
            : null
        }
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
    marginBottom: 8,
    marginTop: 4,
  },
  pendingQueue: {
    marginTop: 12,
  },
  filterHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#757575',
  },
  tableShell: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  tableHeaderWide: {
    gap: 10,
    paddingHorizontal: 16,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    color: '#616161',
    letterSpacing: 0.2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
    minHeight: 64,
    backgroundColor: '#FFFFFF',
  },
  tableRowWide: {
    gap: 10,
    paddingHorizontal: 16,
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  tableRowHighlighted: {
    backgroundColor: '#F1F7F4',
  },
  tableRowPressed: {
    backgroundColor: '#F7F7F7',
  },
  colTaskNarrow: {
    flex: 1.35,
    minWidth: 0,
  },
  colTaskWide: {
    flex: 1.4,
    minWidth: 0,
  },
  colProject: {
    flex: 1.1,
    minWidth: 0,
  },
  colDate: {
    flex: 0.75,
    minWidth: 72,
  },
  colStatusNarrow: {
    width: 108,
    flexShrink: 0,
  },
  colStatusWide: {
    flex: 1.05,
    minWidth: 100,
  },
  colActionsNarrow: {
    width: 100,
    flexShrink: 0,
  },
  colActionsWide: {
    width: 108,
    flexShrink: 0,
  },
  td: {
    fontSize: 13,
    color: '#333333',
  },
  dateOverdue: {
    color: COLORS.alert,
    fontWeight: '600',
  },
  taskCell: {
    justifyContent: 'center',
  },
  taskName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  taskProjectMuted: {
    marginTop: 2,
    fontSize: 12,
    color: '#757575',
  },
  statusCell: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  actionsCell: {
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  actionChip: {
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipPressed: {
    opacity: 0.7,
  },
  actionChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  actionsMuted: {
    fontSize: 13,
    color: '#BDBDBD',
    textAlign: 'center',
    width: '100%',
  },
  evidenceBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  evidenceImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    marginTop: 10,
  },
  metaGrid: {
    gap: 10,
    marginTop: 16,
  },
  metaItem: {
    gap: 2,
  },
  openBtn: {
    marginTop: 12,
  },
  closeBtn: {
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalBody: {
    padding: 20,
  },
  modalChipRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  startModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  dateInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
});
