import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from 'react-native-paper';
import { Text } from '@/components/ui/text';
import { KeyboardBottomSheet } from '@/components/ui/KeyboardBottomSheet';
import { COLORS } from '../../constants';
import { getFarmerHierarchyTask, getFarmerPortalTask } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import { useConnectivityOnline } from '../../hooks/useConnectivityOnline';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { fetchFarmerAssignedTasksForCache } from '../../services/readCacheFetchers';
import { formatCleanDate, formatDisplayDate } from '../../utils/greeting';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import { isTaskOverdue } from '../../utils/taskCategorization';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskQcFailureCard } from '../../components/farmer/FarmerTaskQcFailureCard';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import { useCurrency } from '../../context/CurrencyContext';
import type { FarmerRootStackParamList } from '../../navigation/types';
import {
  DISPLAY_DATE_FORMAT,
  maskDdMmYyyyInput,
  parseAgentTaskDueDateInput,
  todayDisplayDate,
  todayIsoDate,
} from '../../utils/agentTaskDate';
import { startFarmerTaskWithOutbox } from '../../services/submitTaskStartOutbox';
import { recallFarmerTaskWithOutbox } from '../../services/submitTaskRecallOutbox';

type DetailRoute = RouteProp<FarmerRootStackParamList, 'TaskDetail'>;
type DetailNav = NativeStackNavigationProp<FarmerRootStackParamList, 'TaskDetail'>;

type TaskDetail = {
  id: string;
  task_id?: string;
  name: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  payment_value_kes?: number;
  rejection_reason?: string | null;
  photo_evidence_url?: string | null;
  photo_url?: string | null;
  photo_evidence_key?: string | null;
  notes?: string | null;
  farmer_started_at?: string | null;
  source?: 'hierarchy' | 'agent_assignment';
};

function normalizeStatus(status: string): string {
  return status.replace(/_/g, '-');
}

function isSubmittedForApproval(status: string): boolean {
  const s = normalizeStatus(status);
  return s === 'submitted-for-approval' || s === 'submitted';
}

function canStartTask(status: string): boolean {
  return normalizeStatus(status) === 'not-started';
}

function canEditTask(status: string): boolean {
  const s = normalizeStatus(status);
  return s === 'in-progress' || s === 'rejected' || isSubmittedForApproval(s);
}

function shouldShowSubmissionEvidence(status: string): boolean {
  const s = normalizeStatus(status);
  return (
    s === 'submitted-for-approval' ||
    s === 'submitted' ||
    s === 'rejected' ||
    s === 'approved' ||
    s === 'completed'
  );
}

function evidenceUri(task: TaskDetail): string | null {
  const url = (task.photo_evidence_url ?? task.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

function normalizeTaskRef(id: string): string {
  return id.trim().toLowerCase();
}

function taskRefMatches(row: TaskDetail, taskRef: string): boolean {
  const ref = normalizeTaskRef(taskRef);
  if (normalizeTaskRef(String(row.id)) === ref) return true;
  if (row.task_id && normalizeTaskRef(String(row.task_id)) === ref) return true;
  return false;
}

function mapDetailFromApi(
  detail: Record<string, unknown>,
  fromList?: TaskDetail,
  taskRef?: string
): TaskDetail {
  return {
    ...(fromList ?? {}),
    ...detail,
    id: String(detail.id ?? fromList?.id ?? taskRef ?? ''),
    name: String(detail.name ?? fromList?.name ?? 'Task'),
    status: String(detail.status ?? fromList?.status ?? 'not-started'),
    task_id: detail.task_id != null ? String(detail.task_id) : fromList?.task_id,
    assigned_by_name: fromList?.assigned_by_name ?? (detail.assigned_by_name as string | undefined),
    program_project_name:
      fromList?.program_project_name ?? (detail.program_project_name as string | undefined),
    rejection_reason:
      (detail.rejection_reason as string | null | undefined) ?? fromList?.rejection_reason,
    photo_evidence_url:
      (detail.photo_evidence_url as string | null | undefined) ?? fromList?.photo_evidence_url,
    photo_url: (detail.photo_url as string | null | undefined) ?? fromList?.photo_url,
    photo_evidence_key:
      (detail.photo_evidence_key as string | null | undefined) ?? fromList?.photo_evidence_key,
    notes: (detail.notes as string | null | undefined) ?? fromList?.notes,
    farmer_started_at:
      (detail.farmer_started_at as string | null | undefined) ?? fromList?.farmer_started_at,
    source: fromList?.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
  };
}

async function fetchTaskDetailFromApi(taskRef: string, fromList?: TaskDetail): Promise<TaskDetail | null> {
  const loaders = [getFarmerHierarchyTask, getFarmerPortalTask];
  for (const load of loaders) {
    try {
      const detail = await load(taskRef);
      return mapDetailFromApi(detail as Record<string, unknown>, fromList, taskRef);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 403 && status !== 404) throw err;
    }
  }
  return null;
}

export function FarmerTaskDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<DetailNav>();
  const { taskId, fromNotification, openSubmitModal } = route.params;
  const { formatAmount } = useCurrency();
  const userScope = useReadCacheUserScope();
  const online = useConnectivityOnline();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startDateInput, setStartDateInput] = useState(todayDisplayDate());
  const [starting, setStarting] = useState(false);
  const [recalling, setRecalling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerAssignedTasks,
        userScope,
        fetchLive: fetchFarmerAssignedTasksForCache,
      });
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);

      const fromList = (result.data.tasks ?? []).find((row: TaskDetail) =>
        taskRefMatches(row, taskId)
      ) as TaskDetail | undefined;

      let loaded: TaskDetail | null = null;

      if (fromList?.source !== 'agent_assignment' && online !== false) {
        try {
          loaded = await fetchTaskDetailFromApi(taskId, fromList);
        } catch (err: unknown) {
          if (!fromList) throw err;
        }
      }

      if (!loaded && fromList) {
        loaded = { ...fromList };
      }

      if (!loaded) {
        setTask(null);
        setError('Task not found');
        return;
      }

      setTask(loaded);
    } catch (err: unknown) {
      setTask(null);
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Failed to load task details'));
    } finally {
      setLoading(false);
    }
  }, [taskId, userScope, online]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Tasks' });
  };

  useEffect(() => {
    if (!task || !openSubmitModal) return;
    if (canEditTask(task.status) && !isSubmittedForApproval(task.status)) {
      setSubmitOpen(true);
    }
    navigation.setParams({ openSubmitModal: undefined });
  }, [task, openSubmitModal, navigation]);

  const openStart = () => {
    setStartDateInput(todayDisplayDate());
    setStartOpen(true);
  };

  const handleConfirmStart = async () => {
    if (!task) return;
    const isoDate = parseAgentTaskDueDateInput(startDateInput);
    if (!isoDate) {
      showMessage('Invalid date', `Enter start date as ${DISPLAY_DATE_FORMAT}.`);
      return;
    }
    if (isoDate > todayIsoDate()) {
      showMessage('Invalid date', 'Start date cannot be in the future.');
      return;
    }
    setStarting(true);
    try {
      const result = await startFarmerTaskWithOutbox({
        taskId: task.id,
        taskName: task.name,
        source: task.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
        startDate: isoDate,
        expectedStatus: task.status || 'not-started',
      });
      if (result.mode === 'online') {
        showMessage('Task started', `Start date set to ${formatCleanDate(isoDate)}.`);
        setStartOpen(false);
        await load();
        return;
      }
      if (result.mode === 'offline') {
        showMessage(
          'Start saved offline',
          'We will push your start when you are back online. Open Your Tasks to push manually.'
        );
        setStartOpen(false);
        return;
      }
      showMessage('Needs your review', result.error);
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not start task'));
    } finally {
      setStarting(false);
    }
  };

  const handleRecall = async () => {
    if (!task) return;
    setRecalling(true);
    try {
      const result = await recallFarmerTaskWithOutbox({
        taskId: task.id,
        taskName: task.name,
        source: task.source === 'agent_assignment' ? 'agent_assignment' : 'hierarchy',
        expectedStatus: task.status || 'submitted-for-approval',
      });
      if (result.mode === 'online') {
        showMessage(
          'Submission recalled',
          'Your photo and notes are still saved. Edit and resubmit when ready.'
        );
        await load();
        setSubmitOpen(true);
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
      setRecalling(false);
    }
  };

  const confirmAndRecall = () => {
    const title = 'Withdraw submission?';
    const message =
      'This will withdraw your submission from review so you can edit it — continue?';
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        window.confirm(`${title}\n\n${message}`);
      if (confirmed) void handleRecall();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => void handleRecall() },
    ]);
  };

  const handleEdit = () => {
    if (!task || !canEditTask(task.status)) return;
    if (isSubmittedForApproval(task.status)) {
      confirmAndRecall();
      return;
    }
    setSubmitOpen(true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text className="mt-3 text-muted-foreground">Loading task details...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.centered}>
        <Text className="text-base font-semibold text-destructive">{error ?? 'Task not found'}</Text>
        <Pressable onPress={goBack} style={styles.backLink}>
          <Text className="text-sm font-semibold text-[#4472C4]">← Back to tasks</Text>
        </Pressable>
      </View>
    );
  }

  const statusNorm = normalizeStatus(task.status);
  const isQcFailed = statusNorm === 'rejected';
  const photoUrl = evidenceUri(task);
  const overdue = isTaskOverdue(task.due_date, task.status);
  const startDate = task.farmer_started_at
    ? formatCleanDate(task.farmer_started_at)
    : '—';
  const endDate = task.due_date ? formatCleanDate(task.due_date) : '—';
  const showEvidence = shouldShowSubmissionEvidence(task.status);
  const submissionNotes = task.notes?.trim() || '';

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
        <Pressable onPress={goBack} style={styles.backRow}>
          <Text className="text-sm font-semibold text-[#4472C4]">← Back</Text>
        </Pressable>

        {fromNotification ? (
          <Text className="mb-2 text-xs font-semibold text-[#4472C4]">
            Opened from notification
          </Text>
        ) : null}

        <Text className="text-2xl font-bold text-foreground">{task.name}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Status</Text>
          <KBStatusChip
            label={taskStatusLabel(statusNorm)}
            variant={taskStatusVariant(statusNorm)}
          />
        </View>

        {isQcFailed && task.rejection_reason ? (
          <FarmerTaskQcFailureCard reason={task.rejection_reason} />
        ) : null}

        {task.description?.trim() ? (
          <View style={styles.block}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.body}>{task.description.trim()}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.label}>Due date</Text>
          <Text style={[styles.value, overdue ? styles.overdue : undefined]}>
            {task.due_date ? formatCleanDate(task.due_date) : 'No deadline set'}
            {overdue ? ' · Overdue' : ''}
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Start date</Text>
          <Text style={styles.value}>{startDate}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>End date</Text>
          <Text style={[styles.value, overdue ? styles.overdue : undefined]}>{endDate}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Project</Text>
          <Text style={styles.value}>{task.program_project_name ?? '—'}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Assigned by</Text>
          <Text style={styles.value}>{task.assigned_by_name?.trim() || 'Program team'}</Text>
        </View>

        {task.assigned_at ? (
          <View style={styles.block}>
            <Text style={styles.label}>Assigned</Text>
            <Text style={styles.value}>{formatDisplayDate(task.assigned_at)}</Text>
          </View>
        ) : null}

        {task.source !== 'agent_assignment' && task.payment_value_kes != null ? (
          <View style={styles.block}>
            <Text style={styles.label}>Payment</Text>
            <Text style={[styles.value, styles.pay]}>{formatAmount(task.payment_value_kes)}</Text>
          </View>
        ) : null}

        {showEvidence ? (
          <View style={styles.block}>
            <Text style={styles.label}>Your submission</Text>
            {submissionNotes ? (
              <Text style={styles.body}>{submissionNotes}</Text>
            ) : (
              <Text style={styles.muted}>No notes provided.</Text>
            )}
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.evidenceImage} resizeMode="cover" />
            ) : (
              <Text style={styles.required}>Photo required</Text>
            )}
          </View>
        ) : photoUrl ? (
          <View style={styles.block}>
            <Text style={styles.label}>Submitted evidence</Text>
            <Image source={{ uri: photoUrl }} style={styles.evidenceImage} resizeMode="cover" />
          </View>
        ) : null}

        {isSubmittedForApproval(task.status) ? (
          <Text className="mt-4 text-sm italic text-blue-600">
            Awaiting approval — we check status every 30 seconds
          </Text>
        ) : null}

        {canStartTask(task.status) ? (
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            onPress={openStart}
            style={styles.actionBtn}
          >
            Start Task
          </Button>
        ) : canEditTask(task.status) && task.source !== 'agent_assignment' ? (
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            loading={recalling}
            disabled={recalling}
            onPress={handleEdit}
            style={styles.actionBtn}
          >
            {statusNorm === 'rejected' ? 'Resubmit' : 'Edit'}
          </Button>
        ) : task.source === 'agent_assignment' ? null : (
          <Text className="mt-4 text-sm text-muted-foreground">Task locked — no further edits</Text>
        )}

        {task.source === 'agent_assignment' ? (
          <Text className="mt-4 text-sm text-muted-foreground">
            This is a field agent reminder — photo evidence is managed through program tasks.
          </Text>
        ) : null}
      </ScrollView>

      <FarmerTaskSubmitModal
        task={
          submitOpen && task.source !== 'agent_assignment'
            ? {
                id: task.id,
                name: task.name,
                description: task.description ?? undefined,
                payment_value_kes: task.payment_value_kes,
                source: task.source ?? 'hierarchy',
                initialNotes: task.notes ?? null,
                initialPhotoUri: photoUrl,
                initialPhotoKey: task.photo_evidence_key ?? null,
                rejectionReason: task.rejection_reason ?? null,
              }
            : null
        }
        visible={submitOpen && task.source !== 'agent_assignment'}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={async () => {
          setSubmitOpen(false);
          await load();
        }}
      />

      <KeyboardBottomSheet
        visible={startOpen}
        onRequestClose={() => setStartOpen(false)}
        backdropPressDisabled={starting}
        overlayClassName="flex-1 justify-end bg-black/45"
        sheetStyle={styles.startModalCard}
      >
        <Text className="text-lg font-bold text-foreground">Start Task</Text>
        <Text className="mt-1 text-sm text-muted-foreground">{task.name}</Text>
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
          loading={starting}
          disabled={starting}
          onPress={() => void handleConfirmStart()}
          style={styles.actionBtn}
        >
          Confirm start
        </Button>
        <Button mode="text" onPress={() => setStartOpen(false)} disabled={starting}>
          Cancel
        </Button>
      </KeyboardBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F5F5',
  },
  backLink: {
    marginTop: 16,
  },
  backRow: {
    marginBottom: 8,
  },
  section: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  block: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  pay: {
    color: COLORS.accent,
  },
  overdue: {
    color: COLORS.alert,
  },
  muted: {
    fontSize: 14,
    color: '#757575',
  },
  required: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.alert,
  },
  evidenceImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    marginTop: 8,
  },
  actionBtn: {
    marginTop: 24,
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
