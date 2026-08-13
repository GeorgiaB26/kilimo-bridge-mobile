import React, { useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { extractApiError, showMessage } from '../../utils/feedback';
import { KBCard } from '../ui/KBCard';
import { KBStatusChip } from '../ui/KBStatusChip';
import { FarmerTaskSubmitModal } from './FarmerTaskSubmitModal';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import { formatCleanDate } from '../../utils/greeting';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import {
  listPendingTaskSubmissions,
  pushPendingTaskSubmission,
  syncAllPendingTaskSubmissions,
  type PendingTaskSubmissionView,
} from '../../services/submitFarmerTaskOutbox';
import {
  dismissTaskRecallOutbox,
  listPendingTaskRecalls,
  pushPendingTaskRecall,
  recallFarmerTaskWithOutbox,
  syncAllPendingTaskRecalls,
  type PendingTaskRecallView,
} from '../../services/submitTaskRecallOutbox';
import { OutboxTaskRecallCard } from '../OutboxTaskRecallCard';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import {
  fetchFarmerProjectTasksForCache,
  fetchFarmerProjectsForCache,
} from '../../services/readCacheFetchers';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';
import { OfflineCachedDataBanner } from '../OfflineCachedDataBanner';

export interface FarmerTaskRow {
  id: string;
  name: string;
  task_order: number;
  payment_value_kes: number;
  status: string;
  due_date?: string;
  description?: string;
  rejection_reason?: string;
  photo_evidence_url?: string | null;
  photo_url?: string | null;
  photo_evidence_key?: string | null;
  notes?: string | null;
}

interface Props {
  programProjectId?: string;
  compact?: boolean;
}

function normalizeTaskStatus(status: string): string {
  return status.replace(/_/g, '-');
}

function canOpenTask(status: string, hasPendingOffline: boolean): boolean {
  if (hasPendingOffline) return false;
  return ['not-started', 'in-progress', 'rejected'].includes(normalizeTaskStatus(status));
}

function displayStatus(status: string): string {
  const s = normalizeTaskStatus(status);
  if (s === 'submitted-for-approval') return 'Submitted for Approval';
  return taskStatusLabel(s);
}

function evidencePhotoUri(item: FarmerTaskRow): string | null {
  const url = (item.photo_evidence_url ?? item.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

export function FarmerProjectTasksSection({ programProjectId, compact }: Props) {
  const userScope = useReadCacheUserScope();
  const [tasks, setTasks] = useState<FarmerTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<FarmerTaskRow | null>(null);
  const [pendingByTask, setPendingByTask] = useState<Map<string, PendingTaskSubmissionView>>(
    new Map()
  );
  const [orphanPending, setOrphanPending] = useState<PendingTaskSubmissionView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pendingRecalls, setPendingRecalls] = useState<PendingTaskRecallView[]>([]);
  const [pushingRecallId, setPushingRecallId] = useState<string | null>(null);
  const [recallingId, setRecallingId] = useState<string | null>(null);

  const resolveProjectId = useCallback(async (): Promise<string | null> => {
    if (programProjectId) return programProjectId;
    try {
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerProjects,
        userScope,
        fetchLive: fetchFarmerProjectsForCache,
      });
      return result.data.projects?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, [programProjectId, userScope]);

  const applyPendingAgainstTasks = useCallback(
    async (taskList: FarmerTaskRow[]) => {
      const all = await listPendingTaskSubmissions();
      const taskIds = new Set(taskList.map((t) => t.id));
      const matched = new Map<string, PendingTaskSubmissionView>();
      const orphans: PendingTaskSubmissionView[] = [];
      for (const row of all) {
        if (row.farmerTaskId && taskIds.has(row.farmerTaskId)) {
          if (!matched.has(row.farmerTaskId)) matched.set(row.farmerTaskId, row);
          else orphans.push(row); // duplicate queue rows for same task
        } else {
          orphans.push(row);
        }
      }
      setPendingByTask(matched);
      setOrphanPending(orphans);
    },
    []
  );

  const load = useCallback(async () => {
    try {
      await syncAllPendingTaskRecalls();
      setPendingRecalls(await listPendingTaskRecalls());

      const pendingList = await listPendingTaskSubmissions();
      if (pendingList.length > 0) {
        await syncAllPendingTaskSubmissions();
      }

      const pid = await resolveProjectId();
      if (!pid) {
        setTasks([]);
        setCacheFetchedAt(null);
        setError('No program tasks assigned yet. Restart the backend if you expect demo tasks.');
        await applyPendingAgainstTasks([]);
        return;
      }
      const result = await loadWithReadCache({
        cacheKey: READ_CACHE_KEYS.farmerTasks(pid),
        userScope,
        fetchLive: () => fetchFarmerProjectTasksForCache(pid),
      });
      const list = (result.data.tasks ?? []) as FarmerTaskRow[];
      list.sort((a, b) => a.task_order - b.task_order);
      setTasks(list);
      setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
      setError(
        !result.fromCache && list.length === 0 ? 'No tasks for this project yet.' : null
      );
      await applyPendingAgainstTasks(list);
    } catch (err: unknown) {
      setTasks([]);
      setCacheFetchedAt(null);
      setError(extractApiError(err, 'Could not load tasks'));
      await applyPendingAgainstTasks([]);
    } finally {
      setLoading(false);
    }
  }, [resolveProjectId, applyPendingAgainstTasks, userScope]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useTaskApprovalPolling(tasks, load);

  const handlePushPending = async (pending: PendingTaskSubmissionView) => {
    setPushingId(pending.id);
    try {
      const result = await pushPendingTaskSubmission(pending.id);
      if (result.success) {
        showMessage('Synced', `${pending.taskName} submitted. Awaiting review.`);
        await load();
      } else {
        showMessage('Push failed', result.error ?? 'Could not sync task submission');
        await applyPendingAgainstTasks(tasks);
      }
    } finally {
      setPushingId(null);
    }
  };

  const handleRecall = async (item: FarmerTaskRow) => {
    setRecallingId(item.id);
    try {
      const result = await recallFarmerTaskWithOutbox({
        taskId: item.id,
        taskName: item.name,
        source: 'hierarchy',
        expectedStatus: item.status || 'submitted-for-approval',
      });
      setPendingRecalls(await listPendingTaskRecalls());
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
          'We will push your recall when you are back online.'
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

  const completedCount = tasks.filter((t) => ['approved', 'completed'].includes(t.status)).length;
  const pendingCount = pendingByTask.size + orphanPending.length;

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your tasks...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Your Tasks</Text>
        {!compact && tasks.length > 0 ? (
          <Text style={styles.subtitle}>
            {completedCount}/{tasks.length} approved · checking every 30s
            {pendingCount > 0 ? ` · ${pendingCount} saved offline` : ''}
          </Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pendingRecalls.length > 0 ? (
        <View style={styles.offlineSection}>
          <Text style={styles.offlineTitle}>Queued recalls ({pendingRecalls.length})</Text>
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
                    setPendingRecalls(await listPendingTaskRecalls());
                  } finally {
                    setPushingRecallId(null);
                  }
                })();
              }}
              onDismiss={() => {
                void (async () => {
                  await dismissTaskRecallOutbox(item.id);
                  setPendingRecalls(await listPendingTaskRecalls());
                })();
              }}
            />
          ))}
        </View>
      ) : null}
      {cacheFetchedAt ? (
        <View style={styles.cacheBannerWrap}>
          <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} />
        </View>
      ) : null}

      {orphanPending.length > 0 ? (
        <View style={styles.offlineSection}>
          <Text style={styles.offlineTitle}>Offline submissions</Text>
          {orphanPending.map((pending) => (
            <KBCard key={pending.id} elevated={false}>
              <Text style={styles.name}>{pending.taskName}</Text>
              <Text style={styles.offlineMeta}>
                Saved {new Date(pending.createdAt).toLocaleString()}
                {pending.status === 'needs_review'
                  ? ' · Needs your review'
                  : pending.status !== 'pending'
                    ? ` · ${pending.status}`
                    : ''}
              </Text>
              {pending.status === 'needs_review' ? (
                <Text style={styles.rejected}>Needs your review</Text>
              ) : null}
              {pending.syncError ? <Text style={styles.rejected}>{pending.syncError}</Text> : null}
              <Button
                mode="contained"
                buttonColor={COLORS.primary}
                loading={pushingId === pending.id}
                disabled={pushingId === pending.id}
                onPress={() => handlePushPending(pending)}
                style={styles.openBtn}
              >
                Push submission
              </Button>
            </KBCard>
          ))}
        </View>
      ) : null}

      {tasks.map((item) => {
        const pending = pendingByTask.get(item.id);
        const isApproved = item.status === 'approved' || item.status === 'completed';
        const isSubmitted = item.status === 'submitted-for-approval';
        const isRejected = item.status === 'rejected';
        const openable = canOpenTask(item.status, !!pending);
        const evidenceUri =
          isSubmitted || isApproved || isRejected ? evidencePhotoUri(item) : null;

        return (
          <KBCard
            key={item.id}
            elevated={false}
            onPress={openable ? () => setSubmitTask(item) : undefined}
          >
            <View style={styles.row}>
              <View style={styles.nameCol}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.pay}>KES {item.payment_value_kes?.toLocaleString()}</Text>
              </View>
              <View style={styles.badgeCol}>
                {pending ? (
                  <View style={styles.offlineBadge}>
                    <Ionicons name="cloud-offline-outline" size={16} color={COLORS.warning} />
                    <Text style={styles.offlineBadgeText}>Saved offline</Text>
                  </View>
                ) : isApproved ? (
                  <View style={styles.approvedBadge}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                    <Text style={styles.approvedText}>Approved</Text>
                  </View>
                ) : (
                  <KBStatusChip
                    label={displayStatus(item.status)}
                    variant={taskStatusVariant(normalizeTaskStatus(item.status))}
                  />
                )}
              </View>
            </View>

            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            {item.due_date ? <Text style={styles.due}>Due {formatCleanDate(item.due_date)}</Text> : null}

            {pending ? (
              <View style={styles.pendingBlock}>
                <Text style={styles.awaiting}>
                  Evidence saved on this device — not uploaded yet
                  {pending.status !== 'pending' ? ` (${pending.status})` : ''}
                </Text>
                {pending.syncError ? (
                  <Text style={styles.rejected}>{pending.syncError}</Text>
                ) : null}
                {pending.photoLocalUri ? (
                  <Image
                    source={{ uri: pending.photoLocalUri }}
                    style={styles.evidenceImage}
                    resizeMode="cover"
                  />
                ) : null}
                <Button
                  mode="contained"
                  buttonColor={COLORS.primary}
                  loading={pushingId === pending.id}
                  disabled={pushingId === pending.id}
                  onPress={() => handlePushPending(pending)}
                  style={styles.openBtn}
                >
                  Push submission
                </Button>
              </View>
            ) : null}

            {!pending && (isSubmitted || isApproved || isRejected) ? (
              <View style={styles.evidenceWrap}>
                <Text style={styles.evidenceLabel}>Your submission</Text>
                {item.notes?.trim() ? (
                  <Text style={styles.notesText}>{item.notes.trim()}</Text>
                ) : (
                  <Text style={styles.notesMuted}>No notes provided.</Text>
                )}
                {evidenceUri ? (
                  <Image
                    source={{ uri: evidenceUri }}
                    style={styles.evidenceImage}
                    resizeMode="cover"
                    accessibilityLabel={`Evidence photo for ${item.name}`}
                  />
                ) : (
                  <Text style={styles.rejected}>Photo required</Text>
                )}
              </View>
            ) : null}

            {!pending && isSubmitted ? (
              <Text style={styles.awaiting}>Awaiting approval — status updates every 30 seconds</Text>
            ) : null}

            {!pending && isRejected && item.rejection_reason ? (
              <Text style={styles.rejected}>Rejected: {item.rejection_reason}</Text>
            ) : null}

            {!pending && isSubmitted ? (
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
                buttonColor={isRejected ? COLORS.warning : COLORS.primary}
                onPress={() => setSubmitTask(item)}
                style={styles.openBtn}
              >
                {isRejected ? 'Resubmit' : 'Open'}
              </Button>
            ) : null}

            {!pending && isApproved ? (
              <Text style={styles.locked}>Task locked — no further edits</Text>
            ) : null}
          </KBCard>
        );
      })}

      <FarmerTaskSubmitModal
        task={
          submitTask
            ? {
                id: submitTask.id,
                name: submitTask.name,
                description: submitTask.description,
                payment_value_kes: submitTask.payment_value_kes,
                source: 'hierarchy',
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
    </>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  loading: { padding: 24, alignItems: 'center' },
  loadingText: { marginTop: 8, color: COLORS.muted },
  error: { color: COLORS.alert, marginBottom: 12, lineHeight: 20 },
  cacheBannerWrap: { marginHorizontal: -16, marginBottom: 4 },
  offlineSection: { marginBottom: 8 },
  offlineTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  offlineMeta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nameCol: { flex: 1 },
  badgeCol: { alignItems: 'flex-end' },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  pay: { fontSize: 16, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  description: { fontSize: 14, color: COLORS.text, marginTop: 8, lineHeight: 20 },
  due: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  evidenceWrap: { marginTop: 10 },
  evidenceLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginBottom: 6 },
  notesText: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  notesMuted: { fontSize: 14, color: COLORS.muted, lineHeight: 20, marginBottom: 8 },
  evidenceImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    marginTop: 8,
  },
  pendingBlock: { marginTop: 8 },
  awaiting: { fontSize: 13, color: COLORS.info, marginTop: 8, fontStyle: 'italic' },
  rejected: { fontSize: 13, color: COLORS.alert, marginTop: 8, lineHeight: 18 },
  openBtn: { marginTop: 12 },
  locked: { fontSize: 12, color: COLORS.muted, marginTop: 8, fontStyle: 'italic' },
  approvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  approvedText: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  offlineBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.warning },
});
