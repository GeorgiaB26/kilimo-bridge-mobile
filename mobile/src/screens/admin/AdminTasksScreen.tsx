import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator,
  Modal, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Menu } from 'react-native-paper';
import { COLORS } from '../../constants';
import {
  approveFarmerTask,
  getAdminFarmerTasks,
  getProgramProjects,
  rejectFarmerTask,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'submitted-for-approval', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
];

interface TaskRow {
  id: string;
  name: string;
  farmer_name?: string;
  farmer_phone?: string;
  program_project_name?: string;
  program_project_id?: string;
  status: string;
  payment_value_kes?: number;
  due_date?: string;
  notes?: string;
  photo_evidence_url?: string;
  submitted_date?: string;
  approved_date?: string;
  rejection_reason?: string;
  description?: string;
}

export function AdminTasksScreen() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [taskData, projectData] = await Promise.all([
        getAdminFarmerTasks({
          program_project_id: projectFilter || undefined,
          status: statusFilter || undefined,
        }),
        getProgramProjects(),
      ]);
      setTasks(taskData.tasks ?? []);
      setProjects(projectData.projects ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const approve = async () => {
    if (!selected) return;
    setActing(true);
    try {
      await approveFarmerTask(selected.id, approvalNotes.trim() || undefined);
      setSelected(null);
      setApprovalNotes('');
      await load();
      Alert.alert('Approved', 'Farmer notified (SMS in pilot mode).');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!selected || !rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason.');
      return;
    }
    setActing(true);
    try {
      await rejectFarmerTask(selected.id, rejectReason.trim());
      setSelected(null);
      setRejectReason('');
      await load();
      Alert.alert('Rejected', 'Farmer notified to resubmit.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(false);
    }
  };

  const projectLabel = projects.find((p) => p.id === projectFilter)?.name ?? 'All projects';
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label ?? 'All statuses';

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tasks</Text>
      <View style={styles.filters}>
        <Menu visible={projectMenuOpen} onDismiss={() => setProjectMenuOpen(false)} anchor={
          <Button mode="outlined" onPress={() => setProjectMenuOpen(true)} style={styles.filterBtn}>
            {projectLabel}
          </Button>
        }>
          <Menu.Item onPress={() => { setProjectFilter(''); setProjectMenuOpen(false); }} title="All projects" />
          {projects.map((p) => (
            <Menu.Item key={p.id} onPress={() => { setProjectFilter(p.id); setProjectMenuOpen(false); }} title={p.name} />
          ))}
        </Menu>
        <Menu visible={statusMenuOpen} onDismiss={() => setStatusMenuOpen(false)} anchor={
          <Button mode="outlined" onPress={() => setStatusMenuOpen(true)} style={styles.filterBtn}>
            {statusLabel}
          </Button>
        }>
          {STATUS_OPTIONS.map((s) => (
            <Menu.Item key={s.value || 'all'} onPress={() => { setStatusFilter(s.value); setStatusMenuOpen(false); }} title={s.label} />
          ))}
        </Menu>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <KBCard onPress={() => setSelected(item)}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <KBStatusChip label={taskStatusLabel(item.status)} variant={taskStatusVariant(item.status)} />
            </View>
            <Text style={styles.meta}>{item.farmer_name} · {item.program_project_name}</Text>
            <Text style={styles.meta}>KES {(item.payment_value_kes ?? 0).toLocaleString()}{item.due_date ? ` · Due ${item.due_date}` : ''}</Text>
            <Text style={styles.viewLink}>View details →</Text>
          </KBCard>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No tasks yet. Restart the backend — demo hierarchy seeds automatically on first boot.
          </Text>
        }
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalCard} contentContainerStyle={styles.modalContent}>
            <Pressable onPress={() => setSelected(null)} style={styles.close}>
              <Text style={styles.closeText}>✕ Close</Text>
            </Pressable>
            {selected ? (
              <>
                <Text style={styles.modalTitle}>{selected.name}</Text>
                <KBStatusChip label={taskStatusLabel(selected.status)} variant={taskStatusVariant(selected.status)} />
                <Text style={styles.modalMeta}>Farmer: {selected.farmer_name} ({selected.farmer_phone})</Text>
                <Text style={styles.modalMeta}>Project: {selected.program_project_name}</Text>
                <Text style={styles.modalPay}>KES {(selected.payment_value_kes ?? 0).toLocaleString()}</Text>
                {selected.description ? <Text style={styles.modalBody}>{selected.description}</Text> : null}
                {selected.notes ? <Text style={styles.modalBody}>Notes: {selected.notes}</Text> : null}
                {selected.photo_evidence_url ? <Text style={styles.modalBody}>Photo: {selected.photo_evidence_url}</Text> : null}
                {selected.submitted_date ? <Text style={styles.modalMeta}>Submitted: {selected.submitted_date}</Text> : null}
                {selected.rejection_reason ? <Text style={styles.reject}>Rejected: {selected.rejection_reason}</Text> : null}

                {selected.status === 'submitted-for-approval' ? (
                  <View style={styles.actions}>
                    <TextInput style={styles.input} placeholder="Approval notes (optional)" value={approvalNotes} onChangeText={setApprovalNotes} />
                    <Button mode="contained" buttonColor={COLORS.success} onPress={approve} loading={acting}>Approve</Button>
                    <TextInput style={styles.input} placeholder="Rejection reason" value={rejectReason} onChangeText={setRejectReason} />
                    <Button mode="outlined" textColor={COLORS.alert} onPress={reject} loading={acting}>Reject</Button>
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  filterBtn: { flex: 1, minWidth: 140 },
  list: { paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  viewLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24, lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { maxHeight: '85%', backgroundColor: COLORS.background, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalContent: { padding: 20, paddingBottom: 40 },
  close: { alignSelf: 'flex-end', marginBottom: 8 },
  closeText: { color: COLORS.muted, fontSize: 16 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  modalMeta: { fontSize: 14, color: COLORS.muted, marginTop: 6 },
  modalPay: { fontSize: 20, fontWeight: '700', color: COLORS.accent, marginVertical: 12 },
  modalBody: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginTop: 8 },
  reject: { fontSize: 14, color: COLORS.alert, marginTop: 8, fontWeight: '600' },
  actions: { marginTop: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, backgroundColor: COLORS.surface },
});
