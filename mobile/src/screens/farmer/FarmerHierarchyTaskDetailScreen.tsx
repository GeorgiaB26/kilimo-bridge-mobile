import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TextInput, RefreshControl, Image, Platform } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import {
  getFarmerHierarchyTask,
  getFarmerTaskApprovalStatus,
  submitFarmerTaskCompletion,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyTaskDetail'>;

const POLL_MS = 30_000;

export function FarmerHierarchyTaskDetailScreen() {
  const route = useRoute<Route>();
  const { farmerTaskId } = route.params;
  const [task, setTask] = useState<{
    name: string;
    description?: string;
    status: string;
    payment_value_kes: number;
    notes?: string;
    photo_evidence_url?: string;
    rejection_reason?: string;
    program_project_name?: string;
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wasSubmitted, setWasSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFarmerHierarchyTask(farmerTaskId);
      setTask(data);
      if (data.photo_evidence_url?.startsWith('data:') || data.photo_evidence_url?.startsWith('file:')) {
        setPhotoUri(data.photo_evidence_url);
      }
    } catch {
      setTask(null);
    }
  }, [farmerTaskId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!task || task.status !== 'submitted-for-approval') return;
    setWasSubmitted(true);
    const interval = setInterval(async () => {
      try {
        const status = await getFarmerTaskApprovalStatus(farmerTaskId);
        if (status.status === 'approved') {
          await load();
          Alert.alert(
            '✓ Task approved',
            `SMS: Task approved! ${task.payment_value_kes?.toLocaleString() ?? 0} KES pending settlement. Thank you!`
          );
        } else if (status.status === 'rejected') {
          await load();
        }
      } catch {
        // ignore
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [task?.status, farmerTaskId, load, task?.payment_value_kes]);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow camera or gallery access.');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7, base64: true });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const photo_url = photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : photoUri ?? undefined;
      await submitFarmerTaskCompletion(farmerTaskId, { notes: notes.trim() || undefined, photo_url });
      await load();
      Alert.alert('Submitted for approval', 'You will receive an SMS when your manager approves this task.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not submit task'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = task && ['not-started', 'in-progress', 'rejected'].includes(task.status);
  const isApproved = task?.status === 'approved' || task?.status === 'completed';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {task ? (
        <>
          <View style={styles.row}>
            <Text style={styles.title}>{task.name}</Text>
            {isApproved ? (
              <View style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.approvedText}>Approved</Text>
              </View>
            ) : (
              <KBStatusChip
                label={task.status === 'submitted-for-approval' ? 'Submitted for Approval' : taskStatusLabel(task.status)}
                variant={taskStatusVariant(task.status)}
              />
            )}
          </View>
          <Text style={styles.meta}>{task.program_project_name}</Text>
          <Text style={styles.pay}>Payment: KES {task.payment_value_kes?.toLocaleString()}</Text>
          {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}
          {task.rejection_reason ? <Text style={styles.reject}>Rework needed: {task.rejection_reason}</Text> : null}
          {wasSubmitted && task.status === 'submitted-for-approval' ? (
            <Text style={styles.pollHint}>Checking approval status every 30 seconds…</Text>
          ) : null}

          {canSubmit ? (
            <View style={styles.form}>
              <Text style={styles.label}>Photo evidence</Text>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.preview} /> : null}
              <Button mode="outlined" onPress={() => pickImage(Platform.OS !== 'web')} style={styles.btn}>
                {Platform.OS === 'web' ? 'Choose photo' : 'Camera / Gallery'}
              </Button>
              <Text style={styles.label}>Notes</Text>
              <TextInput style={styles.input} multiline value={notes} onChangeText={setNotes} placeholder="Describe your work..." />
              <Button mode="contained" onPress={submit} loading={submitting} buttonColor={COLORS.primary} style={styles.btn}>
                Submit for approval
              </Button>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>Task not found.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, flex: 1 },
  meta: { fontSize: 14, color: COLORS.muted, marginTop: 4 },
  pay: { fontSize: 18, fontWeight: '700', color: COLORS.accent, marginTop: 12 },
  desc: { fontSize: 15, color: COLORS.text, marginTop: 12, lineHeight: 22 },
  reject: { fontSize: 14, color: COLORS.alert, marginTop: 12, fontWeight: '600' },
  pollHint: { fontSize: 13, color: COLORS.info, marginTop: 12, fontStyle: 'italic' },
  form: { marginTop: 20, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginTop: 8 },
  preview: { width: '100%', height: 180, borderRadius: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, backgroundColor: COLORS.background, minHeight: 80 },
  btn: { marginTop: 8 },
  empty: { color: COLORS.muted, textAlign: 'center', padding: 24 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  approvedText: { fontSize: 12, fontWeight: '700', color: COLORS.success },
});
