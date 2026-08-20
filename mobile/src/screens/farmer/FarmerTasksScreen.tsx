import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { extractApiError, showMessage } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
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
import { formatCleanDate } from '../../utils/greeting';
import type { FarmerTabParamList } from '../../navigation/types';
import {
  dismissTaskRecallOutbox,
  listPendingTaskRecalls,
  pushPendingTaskRecall,
  syncAllPendingTaskRecalls,
  type PendingTaskRecallView,
} from '../../services/submitTaskRecallOutbox';
import {
  dismissTaskStartOutbox,
  listPendingTaskStarts,
  pushPendingTaskStart,
  syncAllPendingTaskStarts,
  type PendingTaskStartView,
} from '../../services/submitTaskStartOutbox';
import { TaskNotificationBanner } from '../../components/notifications/TaskNotificationBanner';
import { useTaskNotificationBanners } from '../../hooks/useTaskNotificationBanners';
import { navigateFromFarmerNotification, openFarmerTaskModule } from '../../utils/farmerNotificationNavigation';
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

function isAgentAssignment(task: ExtendedTaskRow): boolean {
  return task.source === 'agent_assignment';
}

function normalizeTaskStatus(status: string): string {
  return status.replace(/_/g, '-');
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
  const userScope = useReadCacheUserScope();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pendingStarts, setPendingStarts] = useState<PendingTaskStartView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [pushingStartId, setPushingStartId] = useState<string | null>(null);
  const [refreshInSec, setRefreshInSec] = useState(REFRESH_INTERVAL_SEC);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<TaskSortMode>('due_asc');
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const countdownSecRef = useRef(REFRESH_INTERVAL_SEC);
  const hasLoadedRef = useRef(false);

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
    navigation.setParams({
      statusFilter: statusFilter === key ? undefined : key,
    });
  };

  const setStatusFilterFromMenu = (key: StatusFilterKey | 'all') => {
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

  // Deep-link: open the same task module used by notifications.
  useEffect(() => {
    if (!scrollTargetId) return;
    openFarmerTaskModule(navigation, scrollTargetId, {
      openSubmitModal: openSubmitModalParam || statusFilter === 'rejected',
    });
    navigation.setParams({
      taskId: undefined,
      highlightTaskId: undefined,
      openSubmitModal: undefined,
    });
  }, [scrollTargetId, openSubmitModalParam, statusFilter, navigation]);

  const openTask = (item: ExtendedTaskRow) => {
    openFarmerTaskModule(navigation, item.id);
  };

  const renderTask = (item: ExtendedTaskRow) => {
    const overdue = isOverdue(item.due_date, item.status);
    const startDate = item.farmer_started_at
      ? formatCleanDate(item.farmer_started_at)
      : '—';
    const endDate = item.due_date ? formatCleanDate(item.due_date) : '—';
    const project = projectLabel(item);

    return (
      <View key={item.id}>
        <KBCard
          elevated={false}
          onPress={() => openTask(item)}
          style={styles.card}
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
          </View>

          <View style={styles.collapsedMeta}>
            <Text style={styles.collapsedMetaText}>
              Start {startDate}
              {' · '}
              End <Text style={overdue ? styles.dateOverdue : undefined}>{endDate}</Text>
            </Text>
            <Text style={styles.expandHint}>Tap to open</Text>
          </View>
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
          <View style={styles.cardList}>
            {visibleTasks.map((item) => renderTask(item))}
          </View>
        )}
      </ScrollView>
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
  notifBlock: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
});
