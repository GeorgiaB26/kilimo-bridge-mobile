import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { KeyboardBottomSheet } from '@/components/ui/KeyboardBottomSheet';
import { Button } from 'react-native-paper';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { COLORS } from '../../constants';
import { extractApiError, showMessage } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import { FarmerTaskQcFailureCard } from '../../components/farmer/FarmerTaskQcFailureCard';
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
} from '../../utils/taskCategorization';
import { formatDisplayDate, formatCleanDate } from '../../utils/greeting';
import {
  DISPLAY_DATE_FORMAT,
  maskDdMmYyyyInput,
  parseAgentTaskDueDateInput,
  todayDisplayDate,
  todayIsoDate,
} from '../../utils/agentTaskDate';
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
import { TaskNotificationBanner } from '../../components/notifications/TaskNotificationBanner';
import { useTaskNotificationBanners } from '../../hooks/useTaskNotificationBanners';
import { navigateFromFarmerNotification } from '../../utils/farmerNotificationNavigation';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { fetchFarmerAssignedTasksForCache } from '../../services/readCacheFetchers';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;
type StatusFilterKey = TaskStatusKpiKey;
type TaskSortMode = 'name_asc' | 'name_desc' | 'due_asc' | 'due_desc';

const REFRESH_INTERVAL_SEC = 30;

const SORT_OPTIONS: { key: TaskSortMode; label: string }[] = [
  { key: 'name_asc', label: 'A–Z' },
  { key: 'name_desc', label: 'Z–A' },
  { key: 'due_asc', label: 'Soonest deadline' },
  { key: 'due_desc', label: 'Latest deadline' },
];

const STATUS_FILTER_OPTIONS: Array<{ key: StatusFilterKey | 'all'; label: string }> = [
  { key: 'all', label: 'All statuses' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'not_started', label: 'Not started' },
  { key: 'submitted_for_approval', label: 'Submitted for approval' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'completed', label: 'Completed' },
];

const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : undefined;

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

/** End/due date — missing deadlines sort last for both soonest and latest. */
function dueSortValue(item: ExtendedTaskRow): number {
  if (!item.due_date?.trim()) return Number.POSITIVE_INFINITY;
  const ms = new Date(item.due_date).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function RefreshCountdownBadge({ seconds, total = REFRESH_INTERVAL_SEC }: { seconds: number; total?: number }) {
  const size = 16;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, seconds / total));
  const offset = circumference * (1 - progress);

  return (
    <View style={styles.refreshBadge} accessibilityLabel={`Refreshing in ${seconds} seconds`}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E0E0E0"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.refreshText}>Refreshing in {seconds}s</Text>
    </View>
  );
}

export function FarmerTasksScreen() {
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation<NavigationProp<FarmerTabParamList>>();
  const statusFilter = route.params?.statusFilter;
  const scrollTargetId = route.params?.taskId ?? route.params?.highlightTaskId;
  const openSubmitModalParam = route.params?.openSubmitModal === true;
  const { formatAmount } = useCurrency();
  const userScope = useReadCacheUserScope();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [startTask, setStartTask] = useState<ExtendedTaskRow | null>(null);
  const [startDateInput, setStartDateInput] = useState(todayDisplayDate());
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pendingStarts, setPendingStarts] = useState<PendingTaskStartView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [pushingStartId, setPushingStartId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [refreshInSec, setRefreshInSec] = useState(REFRESH_INTERVAL_SEC);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<TaskSortMode>('due_asc');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [deepLinkHighlightId, setDeepLinkHighlightId] = useState<string | null>(null);
  const countdownSecRef = useRef(REFRESH_INTERVAL_SEC);
  const hasLoadedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardListOffsetRef = useRef(0);
  const cardOffsetsRef = useRef<Record<string, number>>({});
  const pendingScrollTaskIdRef = useRef<string | null>(null);
  const pendingOpenEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeepLinkRef = useRef<{
    taskId: string;
    openEdit: boolean;
  } | null>(null);

  const { notifications: taskNotifications, dismiss: dismissTaskNotification } =
    useTaskNotificationBanners();

  const loadPendingRecalls = useCallback(async () => {
    setPendingRecalls(await listPendingTaskRecalls());
  }, []);

  const loadPendingStarts = useCallback(async () => {
    setPendingStarts(await listPendingTaskStarts());
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerAssignedTasks,
        userScope,
        fetchLive: fetchFarmerAssignedTasksForCache,
      });
      const list = (result.data.tasks ?? []) as ExtendedTaskRow[];
      setTasks(list);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      setTasks([]);
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Could not load tasks'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userScope]);

  const softRefresh = useCallback(async () => {
    try {
      await syncAllPendingTaskStarts();
      await syncAllPendingTaskRecalls();
      await loadPendingStarts();
      await loadPendingRecalls();
    } catch {
      /* Outbox sync must not block the task list or leave loading stuck. */
    }
    await load();
  }, [load, loadPendingRecalls, loadPendingStarts]);

  const resetCountdown = useCallback(() => {
    countdownSecRef.current = REFRESH_INTERVAL_SEC;
    setRefreshInSec(REFRESH_INTERVAL_SEC);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      resetCountdown();
      void softRefresh();

      const tick = setInterval(() => {
        countdownSecRef.current -= 1;
        if (countdownSecRef.current <= 0) {
          countdownSecRef.current = REFRESH_INTERVAL_SEC;
          void softRefresh();
        }
        if (alive) {
          setRefreshInSec(countdownSecRef.current);
        }
      }, 1000);

      return () => {
        alive = false;
        clearInterval(tick);
      };
    }, [resetCountdown, softRefresh])
  );

  useTaskApprovalPolling(tasks, load);

  const onRefresh = () => {
    setRefreshing(true);
    resetCountdown();
    void softRefresh();
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
        setSubmitTask({ ...item, status: 'in-progress' });
        return;
      }
      if (result.mode === 'offline') {
        showMessage(
          'Recall saved offline',
          'We will push your recall when you are back online. Open Your Tasks to push manually.'
        );
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
    const title = 'Withdraw submission?';
    const message =
      'This will withdraw your submission from review so you can edit it — continue?';

    // RN Alert confirm buttons are unreliable on web; use window.confirm there.
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        window.confirm(`${title}\n\n${message}`);
      if (confirmed) {
        void handleRecall(item);
      }
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => void handleRecall(item),
      },
    ]);
  };

  const handleEdit = (item: ExtendedTaskRow) => {
    if (!canEditTask(item.status)) return;
    if (isSubmittedForApproval(item.status)) {
      confirmAndRecall(item);
      return;
    }
    setSubmitTask(item);
  };

  const openStartModal = (item: ExtendedTaskRow) => {
    setStartDateInput(todayDisplayDate());
    setStartTask(item);
  };

  const handleConfirmStart = async () => {
    if (!startTask) return;
    const isoDate = parseAgentTaskDueDateInput(startDateInput);
    if (!isoDate) {
      showMessage('Invalid date', `Enter start date as ${DISPLAY_DATE_FORMAT}.`);
      return;
    }
    const today = todayIsoDate();
    if (isoDate > today) {
      showMessage('Invalid date', 'Start date cannot be in the future.');
      return;
    }

    setStartingId(startTask.id);
    try {
      const result = await startFarmerTaskWithOutbox({
        taskId: startTask.id,
        taskName: startTask.name,
        source: startTask.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
        startDate: isoDate,
        expectedStatus: startTask.status || 'not-started',
      });
      await loadPendingStarts();
      if (result.mode === 'online') {
        showMessage('Task started', `Start date set to ${formatCleanDate(isoDate)}.`);
        setStartTask(null);
        await load();
        return;
      }
      if (result.mode === 'offline') {
        showMessage(
          'Start saved offline',
          'We will push your start when you are back online. Open Your Tasks to push manually.'
        );
        setStartTask(null);
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
        ? pickCategorizedTasks(categorized, statusFilter)
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

  const visibleTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = flatTasks;
    if (q) {
      list = list.filter((t) => {
        const name = (t.name ?? '').toLowerCase();
        const project = projectLabel(t).toLowerCase();
        return name.includes(q) || project.includes(q);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortMode === 'name_asc') return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      if (sortMode === 'name_desc') return (b.name ?? '').localeCompare(a.name ?? '', undefined, { sensitivity: 'base' });
      if (sortMode === 'due_asc') {
        const diff = dueSortValue(a) - dueSortValue(b);
        if (diff !== 0) return diff;
        return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      }
      // due_desc — finite deadlines descending; missing still last
      const aDue = dueSortValue(a);
      const bDue = dueSortValue(b);
      const aMissing = !Number.isFinite(aDue);
      const bMissing = !Number.isFinite(bDue);
      if (aMissing && bMissing) {
        return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      }
      if (aMissing) return 1;
      if (bMissing) return -1;
      const diff = bDue - aDue;
      if (diff !== 0) return diff;
      return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
    });
    return sorted;
  }, [flatTasks, searchQuery, sortMode]);

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
    if (loading) return;
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
    loading,
    statusFilter,
    categoryCounts.rejected,
    categoryCounts.submitted_for_approval,
    navigation,
  ]);

  const toggleStatusFilter = (key: StatusFilterKey) => {
    setExpandedTaskId(null);
    setDeepLinkHighlightId(null);
    navigation.setParams({
      statusFilter: statusFilter === key ? undefined : key,
    });
  };

  const setStatusFilterFromMenu = (key: StatusFilterKey | 'all') => {
    setExpandedTaskId(null);
    setDeepLinkHighlightId(null);
    setStatusMenuOpen(false);
    navigation.setParams({
      statusFilter: key === 'all' ? undefined : key,
    });
  };

  const resetFilters = () => {
    setStatusMenuOpen(false);
    setSortMenuOpen(false);
    setSortMode('due_asc');
    navigation.setParams({ statusFilter: undefined });
  };

  const statusFilterLabel =
    STATUS_FILTER_OPTIONS.find((o) => o.key === (statusFilter ?? 'all'))?.label ?? 'All statuses';
  const sortLabel = SORT_OPTIONS.find((opt) => opt.key === sortMode)?.label ?? 'Sort';
  const activeFilterCount =
    (statusFilter ? 1 : 0) + (sortMode !== 'due_asc' ? 1 : 0);

  const scrollToTaskCard = useCallback((taskId: string) => {
    const y = cardOffsetsRef.current[taskId];
    if (y == null || !scrollRef.current) return false;
    scrollRef.current.scrollTo({ y: Math.max(0, y - 16), animated: true });
    return true;
  }, []);

  const scheduleScrollToTask = useCallback(
    (taskId: string) => {
      pendingScrollTaskIdRef.current = taskId;
      const attempt = () => {
        if (pendingScrollTaskIdRef.current !== taskId) return;
        if (scrollToTaskCard(taskId)) {
          pendingScrollTaskIdRef.current = null;
        }
      };
      requestAnimationFrame(attempt);
      setTimeout(attempt, 120);
      setTimeout(attempt, 350);
      setTimeout(attempt, 700);
    },
    [scrollToTaskCard]
  );

  // Capture deep-link intent as soon as route params arrive (even while loading).
  useEffect(() => {
    if (!scrollTargetId) return;
    pendingDeepLinkRef.current = {
      taskId: scrollTargetId,
      openEdit:
        openSubmitModalParam ||
        statusFilter === 'rejected',
    };
  }, [scrollTargetId, openSubmitModalParam, statusFilter]);

  // Apply deep-link once tasks are ready: expand + scroll; open Edit modal only when requested
  // (e.g. rejected). New assignments expand details so the farmer can read before Start.
  useEffect(() => {
    const pending = pendingDeepLinkRef.current;
    if (!pending || loading || tasks.length === 0) return;

    const task = tasks.find((t) => t.id === pending.taskId);
    if (!task) return;

    pendingDeepLinkRef.current = null;
    setExpandedTaskId(task.id);
    setDeepLinkHighlightId(task.id);
    scheduleScrollToTask(task.id);

    const shouldOpenAction =
      pending.openEdit ||
      normalizeTaskStatus(task.status) === 'rejected';

    navigation.setParams({
      taskId: undefined,
      highlightTaskId: undefined,
      openSubmitModal: undefined,
    });

    if (!shouldOpenAction) return;

    if (pendingOpenEditTimerRef.current) {
      clearTimeout(pendingOpenEditTimerRef.current);
    }
    // Scroll first, then open the action modal. Keep timer on a ref so route-param
    // updates do not cancel it via effect cleanup.
    pendingOpenEditTimerRef.current = setTimeout(() => {
      pendingOpenEditTimerRef.current = null;
      if (canStartTask(task.status)) {
        setStartDateInput(todayDisplayDate());
        setStartTask(task);
        return;
      }
      // Rejected / in-progress: open evidence submit modal (same as Edit).
      // Skip submitted-for-approval — that path needs an explicit recall confirm.
      if (canEditTask(task.status) && !isSubmittedForApproval(task.status)) {
        setSubmitTask(task);
      }
    }, 500);
  }, [loading, tasks, navigation, scheduleScrollToTask]);

  const onCardListLayout = useCallback((e: LayoutChangeEvent) => {
    cardListOffsetRef.current = e.nativeEvent.layout.y;
  }, []);

  const onTaskCardLayout = useCallback(
    (taskId: string, e: LayoutChangeEvent) => {
      const y = cardListOffsetRef.current + e.nativeEvent.layout.y;
      cardOffsetsRef.current[taskId] = y;
      if (pendingScrollTaskIdRef.current === taskId) {
        if (scrollToTaskCard(taskId)) {
          pendingScrollTaskIdRef.current = null;
        }
      }
    },
    [scrollToTaskCard]
  );

  const toggleExpanded = (taskId: string) => {
    setDeepLinkHighlightId(null);
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const renderActionButton = (item: ExtendedTaskRow) => {
    if (canStartTask(item.status)) {
      return (
        <View
          // Prevent the parent card's onPress from firing when tapping the action.
          onStartShouldSetResponder={() => true}
        >
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            textColor="#FFFFFF"
            loading={startingId === item.id}
            disabled={startingId === item.id}
            onPress={() => openStartModal(item)}
            style={styles.openBtn}
          >
            Start Task
          </Button>
        </View>
      );
    }
    if (canEditTask(item.status)) {
      return (
        <View onStartShouldSetResponder={() => true}>
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            textColor="#FFFFFF"
            loading={recallingId === item.id}
            disabled={recallingId === item.id}
            onPress={() => handleEdit(item)}
            style={styles.openBtn}
          >
            Edit
          </Button>
        </View>
      );
    }
    return (
      <Text className="mt-3 text-sm text-muted-foreground">Task locked — no further edits</Text>
    );
  };

  const renderTask = (item: ExtendedTaskRow) => {
    const overdue = isOverdue(item.due_date, item.status);
    const startDate = item.farmer_started_at
      ? formatCleanDate(item.farmer_started_at)
      : '—';
    const endDate = item.due_date ? formatCleanDate(item.due_date) : '—';
    const deadline = item.due_date ? formatCleanDate(item.due_date) : 'No deadline set';
    const assignedWhen = formatDisplayDate(item.assigned_at);
    const assigner =
      item.assigned_by_name?.trim() ||
      (isAgentAssignment(item) ? 'Your field agent' : 'Program team');
    const highlighted = deepLinkHighlightId === item.id;
    const expanded = expandedTaskId === item.id;
    const statusNorm = normalizeTaskStatus(item.status);
    const project = projectLabel(item);
    const showEvidence = shouldShowSubmissionEvidence(item.status);
    const photoUri = evidencePhotoUri(item);
    const submissionNotes = item.notes?.trim() || '';

    return (
      <View key={item.id} onLayout={(e) => onTaskCardLayout(item.id, e)}>
        <KBCard
          elevated={false}
          onPress={() => toggleExpanded(item.id)}
          style={
            highlighted
              ? { ...styles.card, borderWidth: 2, borderColor: COLORS.primary }
              : styles.card
          }
        >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <View style={styles.taskTitleRow}>
              <Text style={styles.taskName} numberOfLines={2}>
                {item.name}
              </Text>
              <KBStatusChip
                label={displayStatus(item.status)}
                variant={statusVariant(item.status)}
              />
            </View>
            <Text style={styles.taskProjectMuted} numberOfLines={1}>
              {project}
            </Text>
          </View>
          {expanded ? (
            <ChevronUp size={18} color="#757575" />
          ) : (
            <ChevronDown size={18} color="#757575" />
          )}
        </View>

        <View style={styles.collapsedMeta}>
          <Text style={styles.collapsedMetaText}>
            Start {startDate}
            {' · '}
            End <Text style={overdue ? styles.dateOverdue : undefined}>{endDate}</Text>
          </Text>
          <Text style={styles.expandHint}>{expanded ? 'Tap to collapse' : 'Tap for details'}</Text>
        </View>

        {expanded ? (
          <View style={styles.expandedBody}>
            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text className="text-xs font-semibold text-muted-foreground">Project</Text>
                <Text className="text-sm text-foreground">{project}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text className="text-xs font-semibold text-muted-foreground">Start date</Text>
                <Text className="text-sm text-foreground">{startDate}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text className="text-xs font-semibold text-muted-foreground">End date</Text>
                <Text
                  className="text-sm"
                  style={{ color: overdue ? COLORS.alert : COLORS.text }}
                >
                  {endDate}
                  {overdue ? ' · Overdue' : ''}
                </Text>
              </View>
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
                <Text
                  className="text-sm"
                  style={{ color: overdue ? COLORS.alert : COLORS.text }}
                >
                  {deadline}
                  {overdue ? ' · Overdue' : ''}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text className="text-xs font-semibold text-muted-foreground">Payment</Text>
                <Text className="text-sm font-semibold" style={{ color: COLORS.accent }}>
                  {isAgentAssignment(item) ? '—' : formatAmount(item.payment_value_kes ?? 0)}
                </Text>
              </View>
            </View>

            {item.description ? (
              <Text className="mt-3 text-sm leading-5 text-foreground">{item.description}</Text>
            ) : null}

            {isAgentAssignment(item) ? (
              <Text className="mt-2 text-sm text-muted-foreground">Field agent assignment</Text>
            ) : null}

            {showEvidence ? (
              <View style={styles.evidenceBlock}>
                <Text className="mb-2 text-sm font-semibold text-foreground">Your submission</Text>
                {submissionNotes ? (
                  <Text className="text-sm leading-5 text-foreground">{submissionNotes}</Text>
                ) : (
                  <Text className="text-sm text-muted-foreground">No notes provided.</Text>
                )}
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.evidenceImage}
                    resizeMode="cover"
                    accessibilityLabel={`Evidence photo for ${item.name}`}
                  />
                ) : (
                  <Text className="mt-2 text-sm font-semibold text-destructive">Photo required</Text>
                )}
              </View>
            ) : null}

            {statusNorm === 'rejected' && item.rejection_reason ? (
              <FarmerTaskQcFailureCard reason={item.rejection_reason} />
            ) : null}

            {isSubmittedForApproval(item.status) ? (
              <Text className="mt-2 text-sm italic text-blue-600">
                Awaiting approval — we check status every 30 seconds
              </Text>
            ) : null}

            {renderActionButton(item)}
          </View>
        ) : null}
      </KBCard>
      </View>
    );
  };

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text className="mt-3 text-muted-foreground">Loading your tasks...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text className="text-2xl font-bold text-foreground" style={styles.titleText}>
              Your Tasks
            </Text>
            <RefreshCountdownBadge seconds={refreshInSec} />
          </View>
          <TaskStatusKpiRow
            counts={categoryCounts}
            selected={statusFilter ?? null}
            onSelect={toggleStatusFilter}
          />
          {statusFilter ? (
            <Text className="mb-3 mt-2 text-xs text-[#757575]">
              Tap the selected card again to show all tasks
            </Text>
          ) : (
            <Text className="mb-3 mt-2 text-xs text-[#757575]">Tap a card to filter by status</Text>
          )}

          <View className="mb-3 flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
              onPress={() => {
                setShowFiltersPanel((open) => !open);
                setStatusMenuOpen(false);
                setSortMenuOpen(false);
              }}
              className={`flex-row items-center gap-1 rounded-lg px-3 py-2 ${
                showFiltersPanel || activeFilterCount > 0 ? 'bg-[#1A4D3E]' : 'bg-white'
              }`}
              style={webPressable}
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
                placeholder="Search task or project"
                placeholderTextColor="#9E9E9E"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
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
                  setSortMenuOpen(false);
                }}
                className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
                style={webPressable}
              >
                <Text className="text-sm text-[#333333]">{statusFilterLabel}</Text>
                <Text className="text-xs text-[#757575]">{statusMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {statusMenuOpen ? (
                <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                  <ScrollView nestedScrollEnabled>
                    {STATUS_FILTER_OPTIONS.filter(
                      (opt) =>
                        (opt.key !== 'rejected' ||
                          categoryCounts.rejected > 0 ||
                          statusFilter === 'rejected') &&
                        (opt.key !== 'submitted_for_approval' ||
                          categoryCounts.submitted_for_approval > 0 ||
                          statusFilter === 'submitted_for_approval')
                    ).map((opt) => (
                      <Pressable
                        key={opt.key}
                        onPress={() => setStatusFilterFromMenu(opt.key)}
                        className={`px-3 py-2.5 ${
                          (statusFilter ?? 'all') === opt.key ? 'bg-[#E8F5F0]' : 'bg-white'
                        }`}
                        style={webPressable}
                      >
                        <Text
                          className={`text-sm ${
                            (statusFilter ?? 'all') === opt.key
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
                Sort
              </Text>
              <Pressable
                onPress={() => {
                  setSortMenuOpen((o) => !o);
                  setStatusMenuOpen(false);
                }}
                className="mb-2 flex-row items-center justify-between rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2.5"
                style={webPressable}
              >
                <Text className="text-sm text-[#333333]">{sortLabel}</Text>
                <Text className="text-xs text-[#757575]">{sortMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {sortMenuOpen ? (
                <View className="mb-3 max-h-48 overflow-hidden rounded-lg border border-[#EEEEEE]">
                  <ScrollView nestedScrollEnabled>
                    {SORT_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        onPress={() => {
                          setSortMode(opt.key);
                          setSortMenuOpen(false);
                        }}
                        className={`px-3 py-2.5 ${
                          sortMode === opt.key ? 'bg-[#E8F5F0]' : 'bg-white'
                        }`}
                        style={webPressable}
                      >
                        <Text
                          className={`text-sm ${
                            sortMode === opt.key
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

              <View className="mt-1 flex-row flex-wrap gap-2">
                <Pressable
                  onPress={resetFilters}
                  className="rounded-lg border border-[#E0E0E0] bg-white px-3 py-2.5"
                  style={webPressable}
                >
                  <Text className="text-sm font-semibold text-[#757575]">Reset</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
          {error ? <FarmerOfflineBanner message={error} /> : null}
          {taskNotifications.length > 0 ? (
            <View style={styles.notifBlock}>
              <Text className="mb-2 text-sm font-bold text-[#4472C4]">
                {taskNotifications.length} task update
                {taskNotifications.length > 1 ? 's' : ''}
              </Text>
              {taskNotifications.map((notif) => (
                <TaskNotificationBanner
                  key={notif.id}
                  notification={notif}
                  onPress={() => {
                    dismissTaskNotification(notif.id);
                    navigateFromFarmerNotification(navigation, {
                      id: notif.id,
                      type: notif.type,
                      context_type: notif.context_type ?? 'agent_task',
                      context_id: notif.context_id,
                    });
                  }}
                  onDismiss={() => dismissTaskNotification(notif.id)}
                />
              ))}
            </View>
          ) : null}
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

        {visibleTasks.length === 0 ? (
          !error ? (
            <KBCard elevated={false}>
              <Text className="text-base text-muted-foreground text-center">
                {searchQuery.trim()
                  ? 'No tasks match your search.'
                  : statusFilter
                    ? 'No tasks match this filter.'
                    : 'You have no assigned tasks yet. New assignments from your field agent or program team will appear here.'}
              </Text>
            </KBCard>
          ) : null
        ) : (
          <View style={styles.cardList} onLayout={onCardListLayout}>
            {visibleTasks.map((item) => renderTask(item))}
          </View>
        )}
      </ScrollView>

      <KeyboardBottomSheet
        visible={!!startTask}
        onRequestClose={() => setStartTask(null)}
        backdropPressDisabled={!!startingId}
        overlayClassName="flex-1 justify-end bg-black/45"
        sheetStyle={styles.startModalCard}
      >
        <Text className="text-lg font-bold text-foreground">Start Task</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{startTask?.name}</Text>
        <Text className="mt-4 text-xs font-semibold text-muted-foreground">
          When did you start? ({DISPLAY_DATE_FORMAT})
        </Text>
        <TextInput
          value={startDateInput}
          onChangeText={(text) => setStartDateInput(maskDdMmYyyyInput(text))}
          placeholder={DISPLAY_DATE_FORMAT}
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
      </KeyboardBottomSheet>

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
                rejectionReason: submitTask.rejection_reason ?? null,
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
    paddingTop: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  titleText: {
    flexShrink: 1,
  },
  refreshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
  pendingQueue: {
    marginTop: 12,
  },
  cardList: {
    marginTop: 12,
  },
  card: {
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  taskProjectMuted: {
    marginTop: 4,
    fontSize: 13,
    color: '#757575',
  },
  collapsedMeta: {
    marginTop: 10,
    gap: 6,
  },
  collapsedMetaText: {
    fontSize: 13,
    color: '#616161',
  },
  dateOverdue: {
    color: COLORS.alert,
    fontWeight: '600',
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A4D3E',
  },
  expandedBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
    gap: 2,
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
  openBtn: {
    marginTop: 12,
  },
  notifBlock: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  startModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
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
