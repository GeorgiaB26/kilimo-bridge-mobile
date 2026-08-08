import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getFarmerAssignedTasks, getFarmerHierarchyTask, submitFarmerHierarchyTask } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { formatCleanDate } from '../../utils/greeting';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import {
  listPendingTaskSubmissions,
  submitFarmerTaskWithOutbox,
  type PendingTaskSubmissionView,
} from '../../services/submitFarmerTaskOutbox';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import type { FarmerRootStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<FarmerRootStackParamList, 'TaskDetail'>;
type DetailNav = NativeStackNavigationProp<FarmerRootStackParamList, 'TaskDetail'>;

type TaskDetail = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
  start_date?: string | null;
  payment_value_kes?: number;
  program_project_name?: string;
  assigned_at?: string;
  assigned_by_name?: string;
  notes?: string | null;
  photo_evidence_url?: string | null;
  photo_url?: string | null;
  rejection_reason?: string | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  source?: 'hierarchy' | 'agent_assignment';
  /** Program farmer_tasks row — supports photo evidence submit flow. */
  submittable?: boolean;
};

type SelectedImage = {
  uri: string;
  base64?: string | null;
};

type SubmissionHistoryEntry = {
  id: string;
  submittedAt: string;
  statusLabel: string;
  statusVariant: 'success' | 'pending' | 'info' | 'warning' | 'danger';
  notes?: string | null;
  photoUrl?: string | null;
  reviewNotes?: string | null;
};

const MIN_NOTES_ONLY_LENGTH = 1;

function normalizeTaskStatus(status: string): string {
  return status.replace(/_/g, '-');
}

/** Allow submit for actionable program tasks (not completed/approved/pending review). */
function canSubmitTask(status: string): boolean {
  const s = normalizeTaskStatus(status);
  if (s === 'completed' || s === 'approved') return false;
  if (s === 'submitted-for-approval' || s === 'submitted') return false;
  return true;
}

function evidencePhotoUri(task: TaskDetail): string | null {
  const url = (task.photo_evidence_url ?? task.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

function buildSubmissionHistory(task: TaskDetail): SubmissionHistoryEntry[] {
  const status = normalizeTaskStatus(task.status);
  const photoUrl = evidencePhotoUri(task);
  const hasSubmission =
    task.submitted_date ||
    photoUrl ||
    (task.notes?.trim() ?? '') ||
    ['submitted-for-approval', 'submitted', 'approved', 'completed', 'rejected'].includes(status);

  if (!hasSubmission) return [];

  let statusLabel = 'Submitted';
  let statusVariant: SubmissionHistoryEntry['statusVariant'] = 'info';
  if (status === 'approved' || status === 'completed') {
    statusLabel = 'Approved';
    statusVariant = 'success';
  } else if (status === 'rejected') {
    statusLabel = 'Rejected';
    statusVariant = 'danger';
  } else if (status === 'submitted-for-approval' || status === 'submitted') {
    statusLabel = 'Pending review';
    statusVariant = 'warning';
  }

  return [
    {
      id: `${task.id}-submission`,
      submittedAt: task.submitted_date ?? task.assigned_at ?? new Date().toISOString(),
      statusLabel,
      statusVariant,
      notes: task.notes,
      photoUrl,
      reviewNotes: task.rejection_reason,
    },
  ];
}

export function FarmerTaskDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<DetailNav>();
  const { taskId } = route.params;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [notesError, setNotesError] = useState('');
  const [pendingSubmission, setPendingSubmission] = useState<PendingTaskSubmissionView | null>(null);

  const isReadOnlyAgentTask = task != null && !task.submittable;
  const taskIsCompleted =
    task != null && ['approved', 'completed'].includes(normalizeTaskStatus(task.status));
  const showSubmitForm =
    task != null &&
    task.submittable &&
    canSubmitTask(task.status) &&
    !pendingSubmission;

  const submissionHistory = useMemo(
    () => (task ? buildSubmissionHistory(task) : []),
    [task]
  );

  const loadPending = useCallback(async (loadedTask: TaskDetail) => {
    const pending = await listPendingTaskSubmissions();
    const match = pending.find((row) => row.farmerTaskId === loadedTask.id);
    setPendingSubmission(match ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let loaded: TaskDetail | null = null;
      const listRes = await getFarmerAssignedTasks();
      const list = (listRes.tasks ?? []) as TaskDetail[];
      const fromList = list.find((row) => row.id === taskId);

      // Always try program hierarchy detail first — fixes "view only" on admin-assigned tasks.
      try {
        const detail = await getFarmerHierarchyTask(taskId);
        loaded = {
          ...(fromList ?? {}),
          ...detail,
          id: String(detail.id ?? taskId),
          name: String(detail.name ?? fromList?.name ?? 'Task'),
          status: String(detail.status ?? fromList?.status ?? 'not-started'),
          assigned_by_name: fromList?.assigned_by_name ?? detail.assigned_by_name,
          program_project_name: fromList?.program_project_name ?? detail.program_project_name,
          source: 'hierarchy',
          submittable: true,
        };
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 403 && status !== 404) throw err;
      }

      if (!loaded && fromList) {
        loaded = {
          ...fromList,
          submittable: fromList.source !== 'agent_assignment',
        };
      }

      if (!loaded) {
        setTask(null);
        setError('Task not found');
        return;
      }

      setTask(loaded);
      await loadPending(loaded);
    } catch (err: unknown) {
      setTask(null);
      setError(extractApiError(err, 'Failed to load task details'));
    } finally {
      setLoading(false);
    }
  }, [taskId, loadPending]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!task) return;
      load();
    }, [load, task?.id])
  );

  useEffect(() => {
    (async () => {
      try {
        await ImagePicker.requestCameraPermissionsAsync();
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {
        // Permissions requested on first photo action as fallback.
      }
    })();
  }, []);

  useTaskApprovalPolling(task?.submittable ? [task] : [], load);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Tasks' });
  };

  const pickImage = async (useCamera: boolean) => {
    setPicking(true);
    setPhotoError('');
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permission needed', 'Please allow camera or gallery access to upload a photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            aspect: [4, 3],
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: true,
            selectionLimit: 6,
            aspect: [4, 3],
            quality: 0.8,
            base64: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });

      if (!result.canceled && result.assets.length > 0) {
        const newImages = result.assets.map((asset) => ({
          uri: asset.uri,
          base64: asset.base64 ?? null,
        }));
        setSelectedImages((prev) => [...prev, ...newImages].slice(0, 6));
      }
    } finally {
      setPicking(false);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const submitTask = async () => {
    if (!task || !showSubmitForm) return;

    const trimmedNotes = notes.trim();
    const hasPhotos = selectedImages.length > 0;
    const hasNotes = trimmedNotes.length >= MIN_NOTES_ONLY_LENGTH;

    if (!hasPhotos && !hasNotes) {
      setPhotoError('Add at least one photo or a note to submit.');
      setNotesError('Add at least one photo or a note to submit.');
      return;
    }

    setPhotoError('');
    setNotesError('');

    setSubmitting(true);
    try {
      if (hasPhotos) {
        const primaryImage = selectedImages[0];
        const result = await submitFarmerTaskWithOutbox({
          farmerTaskId: task.id,
          taskName: task.name,
          notes: trimmedNotes,
          photoLocalUri: primaryImage.uri,
          photoBase64: primaryImage.base64,
        });
        if (result.mode === 'offline') {
          showMessage(
            'Saved offline',
            'Your evidence is saved on this device. Open Your Tasks when back online to push it.'
          );
        } else {
          showMessage('Task submitted!', 'Awaiting review. We will check status every 30 seconds.');
        }
      } else {
        await submitFarmerHierarchyTask(task.id, { notes: trimmedNotes });
        showMessage('Task submitted!', 'Awaiting review. We will check status every 30 seconds.');
      }

      setNotes('');
      setSelectedImages([]);
      await load();
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not submit task'));
    } finally {
      setSubmitting(false);
    }
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

  const notesHint = selectedImages.length > 0 ? 'Optional with photos' : 'Required without photos';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backRow}>
          <Text className="text-sm font-semibold text-[#4472C4]">← Back</Text>
        </Pressable>
        <Text className="text-xl font-bold text-foreground">{task.name}</Text>
        {isReadOnlyAgentTask ? (
          <Text className="mt-1 text-xs font-semibold text-muted-foreground">
            Field agent assignment · view only
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Status</Text>
          <KBStatusChip
            label={taskStatusLabel(normalizeTaskStatus(task.status))}
            variant={taskStatusVariant(normalizeTaskStatus(task.status))}
          />
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.label}>Project</Text>
          <Text style={styles.value}>
            {task.program_project_name ?? (isReadOnlyAgentTask ? 'Field agent assignment' : '—')}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.label}>Assigned by</Text>
          <Text style={styles.value}>{task.assigned_by_name?.trim() || 'Program team'}</Text>
        </View>

        {task.start_date ? (
          <View style={styles.detailRow}>
            <Text style={styles.label}>Start date</Text>
            <Text style={styles.value}>{formatCleanDate(task.start_date)}</Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Text style={styles.label}>Due date</Text>
          <Text style={styles.value}>
            {task.due_date ? formatCleanDate(task.due_date) : 'No deadline set'}
          </Text>
        </View>

        {task.payment_value_kes != null && task.payment_value_kes > 0 ? (
          <View style={styles.detailRow}>
            <Text style={styles.label}>Payment</Text>
            <Text style={[styles.value, styles.payValue]}>
              KES {task.payment_value_kes.toLocaleString()}
            </Text>
          </View>
        ) : null}

        {task.description?.trim() ? (
          <View style={styles.descriptionBlock}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.descriptionText}>{task.description.trim()}</Text>
          </View>
        ) : null}
      </View>

      {pendingSubmission ? (
        <View style={styles.pendingBanner}>
          <Ionicons name="cloud-upload-outline" size={20} color={COLORS.info} />
          <View style={styles.pendingTextWrap}>
            <Text style={styles.pendingTitle}>Waiting to sync</Text>
            <Text style={styles.pendingBody}>
              Evidence saved on this device. It will upload when you are back online.
            </Text>
          </View>
        </View>
      ) : null}

      {showSubmitForm ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Submit work</Text>

          <Text style={styles.label}>Notes ({notesHint})</Text>
          <TextInput
            style={[styles.noteInput, notesError ? styles.inputError : null]}
            placeholder="Add any notes about this task..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={(text) => {
              setNotes(text);
              if (notesError) setNotesError('');
            }}
            editable={!submitting}
          />
          <Text style={styles.charCount}>
            {notes.trim().length} characters
            {selectedImages.length === 0 && !notes.trim()
              ? ' — add a note or photo to submit'
              : ''}
          </Text>
          {notesError ? <Text style={styles.errorText}>{notesError}</Text> : null}

          <Text style={[styles.label, styles.labelSpaced]}>Upload photos</Text>
          <Text style={styles.subLabel}>
            Add evidence of completed work. Photos optional if you add notes instead.
          </Text>

          {selectedImages.length > 0 ? (
            <View style={styles.imageGrid}>
              {selectedImages.map((image, index) => (
                <View key={`${image.uri}-${index}`} style={styles.imageContainer}>
                  <Image source={{ uri: image.uri }} style={styles.thumbnailImage} />
                  <Pressable style={styles.removeImageButton} onPress={() => removeImage(index)}>
                    <Text style={styles.removeImageButtonText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.uploadButtonsContainer}>
            <Button
              mode="outlined"
              onPress={() => pickImage(true)}
              loading={picking}
              style={styles.uploadButton}
              icon="camera"
            >
              {Platform.OS === 'web' ? 'Upload photo' : 'Take photo'}
            </Button>
            {Platform.OS !== 'web' ? (
              <Button
                mode="outlined"
                onPress={() => pickImage(false)}
                loading={picking}
                style={styles.uploadButton}
                icon="image"
              >
                Choose photo
              </Button>
            ) : null}
          </View>
          {selectedImages.length > 0 ? (
            <Text style={styles.imageCountText}>
              {selectedImages.length} photo{selectedImages.length > 1 ? 's' : ''} selected
            </Text>
          ) : null}
          {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

          <Button
            mode="contained"
            onPress={submitTask}
            loading={submitting}
            buttonColor={COLORS.success}
            style={styles.submitButton}
          >
            Submit for review
          </Button>
        </View>
      ) : null}

      {submissionHistory.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Submission history</Text>
          {submissionHistory.map((entry) => (
            <View key={entry.id} style={styles.submissionCard}>
              <View style={styles.submissionHeader}>
                <Text style={styles.submissionDate}>{formatCleanDate(entry.submittedAt)}</Text>
                <KBStatusChip label={entry.statusLabel} variant={entry.statusVariant} />
              </View>
              {entry.notes?.trim() ? (
                <Text style={styles.submissionContent}>{entry.notes.trim()}</Text>
              ) : null}
              {entry.photoUrl ? (
                <Image source={{ uri: entry.photoUrl }} style={styles.submissionImage} resizeMode="cover" />
              ) : null}
              {entry.reviewNotes?.trim() ? (
                <View style={styles.reviewNotesContainer}>
                  <Text style={styles.reviewNotesLabel}>Reviewer notes</Text>
                  <Text style={styles.reviewNotesText}>{entry.reviewNotes.trim()}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {!showSubmitForm && !taskIsCompleted && submissionHistory.length === 0 ? (
        <View style={styles.emptySubmission}>
          <Text style={styles.emptySubmissionText}>No submissions yet</Text>
          {isReadOnlyAgentTask ? (
            <Text style={styles.emptySubmissionSubText}>
              This assignment was created by your field agent.
            </Text>
          ) : (
            <Text style={styles.emptySubmissionSubText}>
              Your submission is pending review, or add photos and notes above when available.
            </Text>
          )}
        </View>
      ) : null}

      {taskIsCompleted ? (
        <View style={styles.completedSection}>
          <Text style={styles.completedText}>✓ Task completed</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
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
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backRow: {
    marginBottom: 8,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginVertical: 8,
    marginHorizontal: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  labelSpaced: {
    marginTop: 12,
  },
  value: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  payValue: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  descriptionBlock: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  descriptionText: {
    fontSize: 13,
    color: '#1A1A1A',
    marginTop: 8,
    lineHeight: 20,
  },
  subLabel: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1A1A1A',
    textAlignVertical: 'top',
    backgroundColor: '#FAFAFA',
    marginTop: 8,
    minHeight: 100,
  },
  inputError: {
    borderColor: COLORS.alert,
  },
  charCount: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  charCountWarn: {
    color: COLORS.alert,
    fontWeight: '600',
  },
  charCountOk: {
    color: COLORS.success,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.alert,
    marginTop: 6,
    lineHeight: 18,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  imageContainer: {
    position: 'relative',
    width: '30%',
    aspectRatio: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadButton: {
    flex: 1,
  },
  imageCountText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 8,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 16,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 4,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  pendingTextWrap: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.info,
  },
  pendingBody: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
    lineHeight: 18,
  },
  submissionCard: {
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4472C4',
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  submissionDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  submissionContent: {
    fontSize: 12,
    color: '#1A1A1A',
    marginBottom: 8,
    lineHeight: 18,
  },
  submissionImage: {
    width: '100%',
    height: 180,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    marginBottom: 8,
  },
  reviewNotesContainer: {
    backgroundColor: '#FFEBEE',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  reviewNotesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.alert,
  },
  reviewNotesText: {
    fontSize: 12,
    color: '#1A1A1A',
    marginTop: 4,
    lineHeight: 18,
  },
  emptySubmission: {
    alignItems: 'center',
    paddingVertical: 24,
    marginHorizontal: 12,
  },
  emptySubmissionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999999',
  },
  emptySubmissionSubText: {
    fontSize: 12,
    color: '#CCCCCC',
    marginTop: 4,
    textAlign: 'center',
  },
  completedSection: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  completedText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
  },
});
