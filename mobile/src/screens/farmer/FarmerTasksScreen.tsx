import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  useWindowDimensions,
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

type TasksRoute = RouteProp<FarmerTabParamList, 'Tasks'>;
type StatusFilterKey = TaskStatusKpiKey;

/** Show Project / Start / End as collapsed columns at this width and above. */
const WIDE_TABLE_MIN_WIDTH = 600;

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

/** Edit is available until the task is locked by approval/completion. */
function canEditTask(status: string): boolean {
  const s = normalizeTaskStatus(status);
  return !['approved', 'completed'].includes(s);
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

export function FarmerTasksScreen() {
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation<NavigationProp<FarmerTabParamList>>();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_TABLE_MIN_WIDTH;
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
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);

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
      rejected: categorized.rejected.length,
      completed: categorized.completed.length,
    }),
    [categorized]
  );

  useEffect(() => {
    if (statusFilter === 'rejected' && categoryCounts.rejected === 0) {
      navigation.setParams({ statusFilter: undefined });
    }
  }, [statusFilter, categoryCounts.rejected, navigation]);

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

  const renderTableHeader = () => (
    <View style={[styles.tableHeader, wide ? styles.tableHeaderWide : null]}>
      <Text style={[styles.th, styles.colTask]} numberOfLines={1}>
        Task
      </Text>
      {wide ? (
        <>
          <Text style={[styles.th, styles.colProject]} numberOfLines={1}>
            Project
          </Text>
          <Text style={[styles.th, styles.colDate]} numberOfLines={1}>
            Start date
          </Text>
          <Text style={[styles.th, styles.colDate]} numberOfLines={1}>
            End date
          </Text>
        </>
      ) : null}
      <Text style={[styles.th, styles.colStatus]} numberOfLines={1}>
        Status
      </Text>
      <Text style={[styles.th, styles.colActions]} numberOfLines={1}>
        Actions
      </Text>
    </View>
  );

  const renderTask = (item: ExtendedTaskRow) => {
    const agentTask = isAgentAssignment(item);
    const overdue = isOverdue(item.due_date, item.status);
    const assignedWhen = formatDisplayDate(item.assigned_at);
    const startDate = item.assigned_at ? formatCleanDate(item.assigned_at) : '—';
    const endDate = item.due_date ? formatCleanDate(item.due_date) : '—';
    const deadline = item.due_date ? formatCleanDate(item.due_date) : 'No deadline set';
    const assigner =
      item.assigned_by_name?.trim() || (agentTask ? 'Your field agent' : 'Program team');
    const highlighted = scrollTargetId === item.id;
    const expanded = expandedTaskId === item.id;
    const statusNorm = normalizeTaskStatus(item.status);
    const editable = canEditTask(item.status);
    const showEvidence = shouldShowSubmissionEvidence(item.status);
    const photoUri = evidencePhotoUri(item);
    const submissionNotes = item.notes?.trim() || '';
    const project = projectLabel(item);

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
        <View style={[styles.tableRow, wide ? styles.tableRowWide : null]}>
          <View style={[styles.colTask, styles.taskCell]}>
            <View style={styles.taskTitleRow}>
              <Text style={styles.taskName} numberOfLines={2}>
                {item.name}
              </Text>
              {expanded ? (
                <ChevronUp size={16} color="#757575" />
              ) : (
                <ChevronDown size={16} color="#757575" />
              )}
            </View>
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
                style={[
                  styles.td,
                  styles.colDate,
                  overdue ? styles.dateOverdue : null,
                ]}
                numberOfLines={1}
              >
                {endDate}
              </Text>
            </>
          ) : null}

          <View style={[styles.colStatus, styles.statusCell]}>
            <KBStatusChip
              label={displayStatus(item.status)}
              variant={statusVariant(item.status)}
            />
          </View>

          <View style={[styles.colActions, styles.actionsCell]}>
            {editable ? (
              <Button
                mode="outlined"
                compact
                textColor={COLORS.primary}
                loading={recallingId === item.id}
                disabled={recallingId === item.id}
                onPress={() => handleEdit(item)}
                style={styles.editBtn}
                labelStyle={styles.editBtnLabel}
              >
                Edit
              </Button>
            ) : (
              <Text style={styles.actionsMuted}>—</Text>
            )}
          </View>
        </View>

        {expanded ? (
          <View style={styles.expandedBody}>
            {!wide ? (
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
              </View>
            ) : null}

            <View style={[styles.metaGrid, !wide ? styles.metaGridSpaced : null]}>
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

            {item.description ? (
              <Text className="mt-3 text-sm leading-5 text-foreground">{item.description}</Text>
            ) : null}

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

            {editable ? (
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
            ) : (
              <Text className="mt-3 text-sm text-muted-foreground">
                Task locked — no further edits
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.expandHint}>Tap row for details</Text>
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
            {sections.length > 0 ? renderTableHeader() : null}
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
    marginBottom: 8,
    marginTop: 4,
  },
  pendingRecalls: {
    marginTop: 12,
  },
  filterHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#757575',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    gap: 8,
  },
  tableHeaderWide: {
    gap: 10,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#757575',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableRowWide: {
    gap: 10,
  },
  colTask: {
    flex: 1.4,
    minWidth: 0,
  },
  colProject: {
    flex: 1.1,
    minWidth: 0,
  },
  colDate: {
    flex: 0.85,
    minWidth: 0,
  },
  colStatus: {
    flex: 1.05,
    minWidth: 72,
  },
  colActions: {
    width: 72,
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
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  taskName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
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
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editBtn: {
    minWidth: 64,
    borderColor: COLORS.primary,
  },
  editBtnLabel: {
    fontSize: 12,
    marginVertical: 2,
    marginHorizontal: 4,
  },
  actionsMuted: {
    fontSize: 13,
    color: '#BDBDBD',
    textAlign: 'right',
    width: '100%',
  },
  card: {
    marginBottom: 10,
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
  metaGridSpaced: {
    marginTop: 12,
  },
  metaItem: {
    gap: 2,
  },
  openBtn: {
    marginTop: 12,
  },
});
