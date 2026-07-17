import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { getFarmerHierarchyTask, submitFarmerHierarchyTask } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyTaskDetail'>;

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
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFarmerHierarchyTask(farmerTaskId);
      setTask(data);
      if (data.notes && !notes) setNotes(data.notes);
      if (data.photo_evidence_url && !photoUrl) setPhotoUrl(data.photo_evidence_url);
    } catch {
      setTask(null);
    }
  }, [farmerTaskId, notes, photoUrl]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await submitFarmerHierarchyTask(farmerTaskId, { notes: notes.trim() || undefined, photo_url: photoUrl.trim() || undefined });
      await load();
      Alert.alert('Submitted', 'Your task is awaiting manager approval.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not submit task'));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = task && ['not-started', 'in-progress', 'rejected'].includes(task.status);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {task ? (
        <>
          <View style={styles.row}>
            <Text style={styles.title}>{task.name}</Text>
            <KBStatusChip label={taskStatusLabel(task.status)} variant={taskStatusVariant(task.status)} />
          </View>
          <Text style={styles.meta}>{task.program_project_name}</Text>
          <Text style={styles.pay}>Payment: KES {task.payment_value_kes?.toLocaleString()}</Text>
          {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}
          {task.rejection_reason ? (
            <Text style={styles.reject}>Rework needed: {task.rejection_reason}</Text>
          ) : null}

          {canSubmit ? (
            <View style={styles.form}>
              <Text style={styles.label}>Notes (what you completed)</Text>
              <TextInput style={styles.input} multiline value={notes} onChangeText={setNotes} placeholder="Describe your work..." />
              <Text style={styles.label}>Photo URL (optional)</Text>
              <TextInput style={styles.input} value={photoUrl} onChangeText={setPhotoUrl} placeholder="https://..." autoCapitalize="none" />
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
  form: { marginTop: 20, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginTop: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, backgroundColor: COLORS.background, minHeight: 48 },
  btn: { marginTop: 12, marginBottom: 32 },
  empty: { color: COLORS.muted, textAlign: 'center', padding: 24 },
});
