import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Platform,
  Image,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp, NavigationProp } from '@react-navigation/native';
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

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;
type StatusFilterKey = Exclude<TaskCategoryFilter, 'rejected'>;

type ExtendedTaskRow = FarmerTaskRow & {
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  source?: 'hierarchy' | 'agent_assignment';
  notes?: string | null;
  photo_evidence_key?: string | null;
};

function evidencePhotoUri(item: ExtendedTaskRow): string | null {
  const url = (item.photo_evidence_url ?? item.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

/** Show read-only notes + photo after the farmer has submitted (or after review). */
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

const KPI_CARDS: Array<{
  key: StatusFilterKey;
  label: string;
  badgeBg: string;
  countColor: string;
}> = [
  { key: 'overdue', label: 'OVERDUE', badgeBg: '#FFEBEE', countColor: '#C62828' },
  { key: 'in_progress', label: 'IN PROGRESS', badgeBg: '#FFF3E0', countColor: '#EF6C00' },
  { key: 'not_started', label: 'NOT STARTED', badgeBg: '#F5F5F5', countColor: '#37474F' },
  { key: 'completed', label: 'COMPLETED', badgeBg: '#E8F5E9', countColor: '#2E7D32' },
];

const KPI_LABEL_MAX_FONT = 10;
const KPI_LABEL_MIN_FONT = 5.5;
/** Approximate width factor for bold uppercase sans glyphs. */
const KPI_LABEL_CHAR_WIDTH = 0.72;

/** Shared font size so the longest KPI label fits in the measured label width. */
function kpiLabelFontSizeForWidth(labelWidth: number): number {
  if (labelWidth <= 0) return KPI_LABEL_MAX_FONT;
  const longest = Math.max(...KPI_CARDS.map((k) => k.label.length));
  const letterSpacing = 0.15;
  let size = KPI_LABEL_MAX_FONT;
  while (size > KPI_LABEL_MIN_FONT) {
    const estimated =
      longest * size * KPI_LABEL_CHAR_WIDTH + Math.max(0, longest - 1) * letterSpacing;
    if (estimated <= labelWidth) return Math.round(size * 10) / 10;
    size -= 0.25;
  }
  return KPI_LABEL_MIN_FONT;
}

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
  const navigation = useNavigation<NavigationProp<FarmerTabParamList>>();
  const statusFilter = route.params?.statusFilter;
  const scrollTargetId = route.params?.taskId ?? route.params?.highlightTaskId;
  const listRef = useRef<SectionList>(null);
  const { formatAmount } = useCurrency();
  const [tasks, setTasks] = useState<ExtendedTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<ExtendedTaskRow | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [kpiLabelWidth, setKpiLabelWidth] = useState(0);
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);

  const kpiLabelFontSize = useMemo(
    () => kpiLabelFontSizeForWidth(kpiLabelWidth),
    [kpiLabelWidth]
  );

  const onKpiLabelLayout = useCallback((width: number) => {
    if (width <= 0) return;
    setKpiLabelWidth((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
  }, []);

  const loadPendingRecalls = useCallback(async () => {
    setPendingRecalls(await listPendingTaskRecalls());
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
        await syncAllPendingTaskRecalls();
        await loadPendingRecalls();
        await load();
      })();
      const interval = setInterval(() => {
        void load();
        void loadPendingRecalls();
      }, 30000);
      return () => clearInterval(interval);
    }, [load, loadPendingRecalls, tasks.length])
  );

  useTaskApprovalPolling(tasks, load);

  const onRefresh = () => {
    setRefreshing(true);
    void (async () => {
      await syncAllPendingTaskRecalls();
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

  const categorized = useMemo(() => categorizeTasks(tasks), [tasks]);
  const displayCategories = useMemo(
    () =>
      statusFilter
        ? pickCategorizedTasks(categorized, statusFilter as TaskCategoryFilter)
        : categorized,
    [categorized, statusFilter]
  );

  const categoryCounts = useMemo(
    () => ({
      overdue: categorized.overdue.length,
      in_progress: categorized.inProgress.length,
      not_started: categorized.notStarted.length,
      completed: categorized.completed.length,
    }),
    [categorized]
  );

  const toggleStatusFilter = (key: StatusFilterKey) => {
    setExpandedTaskId(null);
    navigation.setParams({
      statusFilter: statusFilter === key ? undefined : key,
    });
  };

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
    if (displayCategories.rejected.length > 0) {
      list.push({
        title: `REJECTED (${displayCategories.rejected.length})`,
        data: displayCategories.rejected,
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

    if (canOpenTask(task.status)) {
      setSubmitTask(task);
    }
    setExpandedTaskId(task.id);
    navigation.setParams({ taskId: undefined, highlightTaskId: undefined });
  }, [scrollTargetId, tasks, loading, navigation, sections]);

  const toggleExpanded = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const renderTask = (item: ExtendedTaskRow) => {
    const agentTask = isAgentAssignment(item);
    const openable = canOpenTask(item.status);
    const overdue = isOverdue(item.due_date, item.status);
    const assignedWhen = formatDisplayDate(item.assigned_at);
    const deadline = item.due_date ? formatCleanDate(item.due_date) : 'No deadline set';
    const assigner =
      item.assigned_by_name?.trim() || (agentTask ? 'Your field agent' : 'Program team');
    const highlighted = scrollTargetId === item.id;
    const expanded = expandedTaskId === item.id;
    const statusNorm = normalizeTaskStatus(item.status);
    const openLabel = statusNorm === 'rejected' ? 'Resubmit task' : 'Open task';
    const openButtonColor = statusNorm === 'rejected' ? COLORS.warning : COLORS.primary;
    const showEvidence = shouldShowSubmissionEvidence(item.status);
    const photoUri = evidencePhotoUri(item);
    const submissionNotes = item.notes?.trim() || '';

    return (
      <KBCard
        elevated={false}
        onPress={() => toggleExpanded(item.id)}
        style={
          highlighted
            ? { ...styles.card, borderWidth: 2, borderColor: COLORS.primary }
            : styles.card
        }
      >
        <View style={styles.row}>
          <View style={styles.titleCol}>
            <Text className="text-lg font-bold text-foreground">{item.name}</Text>
          </View>
          <View style={styles.headerRight}>
            <KBStatusChip label={displayStatus(item.status)} variant={statusVariant(item.status)} />
            {expanded ? (
              <ChevronUp size={18} color="#757575" />
            ) : (
              <ChevronDown size={18} color="#757575" />
            )}
          </View>
        </View>

        {item.program_project_name ? (
          <Text className="mt-1 text-sm text-muted-foreground">{item.program_project_name}</Text>
        ) : null}

        {item.description ? (
          <Text className="mt-2 text-sm text-foreground leading-5">{item.description}</Text>
        ) : null}

        {!expanded && openable ? (
          <Button
            mode="contained"
            buttonColor={openButtonColor}
            onPress={() => setSubmitTask(item)}
            style={styles.openBtn}
          >
            {openLabel}
          </Button>
        ) : null}

        {expanded ? (
          <View style={styles.expandedBody}>
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
              <Text className="mt-2 text-sm text-muted-foreground">Field agent assignment</Text>
            ) : null}

            {showEvidence ? (
              <View style={styles.evidenceBlock}>
                <Text className="mb-2 text-sm font-semibold text-foreground">Your submission</Text>
                {submissionNotes ? (
                  <View style={styles.metaItem}>
                    <Text className="text-xs font-semibold text-muted-foreground">Notes</Text>
                    <Text className="mt-1 text-sm leading-5 text-foreground">{submissionNotes}</Text>
                  </View>
                ) : (
                  <Text className="text-sm text-muted-foreground">No notes provided.</Text>
                )}
                {photoUri ? (
                  <View style={styles.evidencePhotoWrap}>
                    <Text className="mb-2 text-xs font-semibold text-muted-foreground">
                      Photo evidence
                    </Text>
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.evidenceImage}
                      resizeMode="cover"
                      accessibilityLabel={`Evidence photo for ${item.name}`}
                    />
                  </View>
                ) : (
                  <Text className="mt-2 text-sm font-semibold text-destructive">Photo required</Text>
                )}
              </View>
            ) : null}

            {statusNorm === 'rejected' && item.rejection_reason ? (
              <Text className="mt-2 text-sm text-destructive">{item.rejection_reason}</Text>
            ) : null}

            {statusNorm === 'submitted-for-approval' ? (
              <Text className="mt-2 text-sm italic text-blue-600">
                Awaiting approval — we check status every 30 seconds
              </Text>
            ) : null}

            {statusNorm === 'submitted-for-approval' ? (
              <Button
                mode="outlined"
                textColor={COLORS.primary}
                loading={recallingId === item.id}
                disabled={recallingId === item.id}
                onPress={() => void handleRecall(item)}
                style={styles.openBtn}
              >
                Recall submission
              </Button>
            ) : null}

            {openable ? (
              <Button
                mode="contained"
                buttonColor={openButtonColor}
                onPress={() => setSubmitTask(item)}
                style={styles.openBtn}
              >
                {openLabel}
              </Button>
            ) : null}
          </View>
        ) : (
          <Text style={styles.expandHint}>
            {openable
              ? 'Tap card for more details'
              : showEvidence
                ? 'Tap to view your submission'
                : 'Tap for details'}
          </Text>
        )}
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
            <View style={styles.kpiRow}>
              {KPI_CARDS.map((kpi) => {
                const selected = statusFilter === kpi.key;
                return (
                  <Pressable
                    key={kpi.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${kpi.label}: ${categoryCounts[kpi.key]}. ${
                      selected ? 'Filter active, tap to show all tasks' : 'Tap to filter'
                    }`}
                    onPress={() => toggleStatusFilter(kpi.key)}
                    style={[
                      styles.kpiCard,
                      selected ? styles.kpiCardSelected : null,
                      Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
                    ]}
                  >
                    <View
                      style={styles.kpiLabelWrap}
                      onLayout={(e) => onKpiLabelLayout(e.nativeEvent.layout.width)}
                    >
                      <Text
                        style={[styles.kpiLabel, { fontSize: kpiLabelFontSize }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={KPI_LABEL_MIN_FONT / KPI_LABEL_MAX_FONT}
                        allowFontScaling={false}
                      >
                        {kpi.label}
                      </Text>
                    </View>
                    <View style={[styles.kpiBadge, { backgroundColor: kpi.badgeBg }]}>
                      <Text style={[styles.kpiCount, { color: kpi.countColor }]}>
                        {categoryCounts[kpi.key]}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {statusFilter ? (
              <Text style={styles.filterHint}>Tap the selected card again to show all tasks</Text>
            ) : (
              <Text style={styles.filterHint}>Updates every 30s</Text>
            )}
            {error ? <FarmerOfflineBanner message={error} /> : null}
            {pendingRecalls.length > 0 ? (
              <View style={styles.pendingRecalls}>
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
    marginBottom: 12,
    marginTop: 4,
  },
  pendingRecalls: {
    marginTop: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  kpiCardSelected: {
    borderColor: '#1A4D3E',
    borderWidth: 2,
  },
  kpiLabelWrap: {
    width: '100%',
    marginBottom: 8,
    overflow: 'hidden',
  },
  kpiLabel: {
    width: '100%',
    fontWeight: '700',
    color: '#666666',
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  kpiBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  filterHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#757575',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandedBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  expandHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#1A4D3E',
  },
  evidenceBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  evidencePhotoWrap: {
    marginTop: 10,
  },
  evidenceImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
    gap: 2,
  },
  openBtn: {
    marginTop: 12,
  },
});
