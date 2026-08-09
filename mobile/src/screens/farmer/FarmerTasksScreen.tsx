import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { Button } from 'react-native-paper';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
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
type TaskSortMode = 'name_asc' | 'name_desc' | 'due_asc' | 'due_desc';

const REFRESH_INTERVAL_SEC = 30;

const SORT_OPTIONS: { key: TaskSortMode; label: string }[] = [
  { key: 'name_asc', label: 'A–Z' },
  { key: 'name_desc', label: 'Z–A' },
  { key: 'due_asc', label: 'Soonest deadline' },
  { key: 'due_desc', label: 'Latest deadline' },
];

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
  const { formatAmount } = useCurrency();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [startTask, setStartTask] = useState<ExtendedTaskRow | null>(null);
  const [startDateInput, setStartDateInput] = useState(todayYmd());
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pendingStarts, setPendingStarts] = useState<PendingTaskStartView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [pushingStartId, setPushingStartId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [refreshInSec, setRefreshInSec] = useState(REFRESH_INTERVAL_SEC);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<TaskSortMode>('due_asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const countdownSecRef = useRef(REFRESH_INTERVAL_SEC);
  const hasLoadedRef = useRef(false);

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
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      setTasks([]);
      setError(extractApiError(err, 'Could not load tasks'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const softRefresh = useCallback(async () => {
    await syncAllPendingTaskStarts();
    await syncAllPendingTaskRecalls();
    await loadPendingStarts();
    await loadPendingRecalls();
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

  const sortLabel =
    SORT_OPTIONS.find((opt) => opt.key === sortMode)?.label ?? 'Sort';

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
    setExpandedTaskId(null);
    navigation.setParams({
      statusFilter: statusFilter === key ? undefined : key,
    });
  };

  useEffect(() => {
    if (!scrollTargetId || loading || tasks.length === 0) return;
    const task = tasks.find((t) => t.id === scrollTargetId);
    if (!task) return;
    setExpandedTaskId(task.id);
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined });
  }, [scrollTargetId, tasks, loading, navigation]);

  const toggleExpanded = (taskId: string) => {
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
    const highlighted = scrollTargetId === item.id;
    const expanded = expandedTaskId === item.id;
    const statusNorm = normalizeTaskStatus(item.status);
    const project = projectLabel(item);
    const showEvidence = shouldShowSubmissionEvidence(item.status);
    const photoUri = evidencePhotoUri(item);
    const submissionNotes = item.notes?.trim() || '';

    return (
      <KBCard
        key={item.id}
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
              {expanded ? (
                <ChevronUp size={18} color="#757575" />
              ) : (
                <ChevronDown size={18} color="#757575" />
              )}
            </View>
            <Text style={styles.taskProjectMuted} numberOfLines={1}>
              {project}
            </Text>
          </View>
          <KBStatusChip
            label={displayStatus(item.status)}
            variant={statusVariant(item.status)}
          />
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
              <Text className="mt-2 text-sm text-destructive">{item.rejection_reason}</Text>
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
      <ScrollView
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
            <Text style={styles.filterHint}>Tap the selected card again to show all tasks</Text>
          ) : null}

          <View style={styles.searchSortRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#757575" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search task or project"
                placeholderTextColor="#9E9E9E"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort tasks: ${sortLabel}`}
              onPress={() => setSortMenuOpen((open) => !open)}
              style={({ pressed }) => [
                styles.sortButton,
                sortMenuOpen ? styles.sortButtonOpen : null,
                pressed ? styles.sortButtonPressed : null,
              ]}
            >
              <Text style={styles.sortButtonLabel} numberOfLines={1}>
                {sortLabel}
              </Text>
              <Text style={styles.sortChevron}>{sortMenuOpen ? '▲' : '▼'}</Text>
            </Pressable>
          </View>
          {sortMenuOpen ? (
            <View style={styles.sortMenu}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    setSortMode(opt.key);
                    setSortMenuOpen(false);
                  }}
                  style={[
                    styles.sortMenuItem,
                    sortMode === opt.key ? styles.sortMenuItemActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.sortMenuItemLabel,
                      sortMode === opt.key ? styles.sortMenuItemLabelActive : null,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

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
          <View style={styles.cardList}>{visibleTasks.map((item) => renderTask(item))}</View>
        )}
      </ScrollView>

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
  filterHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#757575',
  },
  searchSortRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    paddingLeft: 6,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: '#1A1A1A',
  },
  sortButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  sortButtonOpen: {
    borderColor: COLORS.primary,
    backgroundColor: '#F1F7F4',
  },
  sortButtonPressed: {
    opacity: 0.85,
  },
  sortButtonLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#1A1A1A',
  },
  sortChevron: {
    fontSize: 10,
    color: '#757575',
  },
  sortMenu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  sortMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  sortMenuItemActive: {
    backgroundColor: '#E8F5F0',
  },
  sortMenuItemLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#333333',
  },
  sortMenuItemLabelActive: {
    color: COLORS.primary,
  },
  cardList: {
    marginTop: 12,
  },
  card: {
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
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
