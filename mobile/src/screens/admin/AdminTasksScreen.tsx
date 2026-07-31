import React, { useState, useCallback } from 'react';
import {
  View, FlatList, RefreshControl, ActivityIndicator,
  Modal, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Button as PaperButton } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
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
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <Text className="mb-3 text-[26px] font-bold text-[#1A4D3E]">Tasks</Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        <Menu visible={projectMenuOpen} onDismiss={() => setProjectMenuOpen(false)} anchor={
          <PaperButton mode="outlined" onPress={() => setProjectMenuOpen(true)} style={{ flex: 1, minWidth: 140 }}>
            {projectLabel}
          </PaperButton>
        }>
          <Menu.Item onPress={() => { setProjectFilter(''); setProjectMenuOpen(false); }} title="All projects" />
          {projects.map((p) => (
            <Menu.Item key={p.id} onPress={() => { setProjectFilter(p.id); setProjectMenuOpen(false); }} title={p.name} />
          ))}
        </Menu>
        <Menu visible={statusMenuOpen} onDismiss={() => setStatusMenuOpen(false)} anchor={
          <PaperButton mode="outlined" onPress={() => setStatusMenuOpen(true)} style={{ flex: 1, minWidth: 140 }}>
            {statusLabel}
          </PaperButton>
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
        contentContainerClassName="pb-8"
        renderItem={({ item }) => (
          <KBCard onPress={() => setSelected(item)}>
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-base font-bold text-[#333333]">{item.name}</Text>
              <KBStatusChip label={taskStatusLabel(item.status)} variant={taskStatusVariant(item.status)} />
            </View>
            <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.program_project_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">KES {(item.payment_value_kes ?? 0).toLocaleString()}{item.due_date ? ` · Due ${item.due_date}` : ''}</Text>
            <Text className="mt-2 text-[13px] font-semibold text-[#1A4D3E]">View details →</Text>
          </KBCard>
        )}
        ListEmptyComponent={
          <Text className="p-6 text-center leading-[22px] text-[#757575]">
            No tasks yet. Restart the backend — demo hierarchy seeds automatically on first boot.
          </Text>
        }
      />

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <ScrollView className="max-h-[85%] rounded-t-2xl bg-white" contentContainerClassName="p-5 pb-10">
            <Pressable onPress={() => setSelected(null)} className="mb-2 self-end">
              <Text className="text-base text-[#757575]">✕ Close</Text>
            </Pressable>
            {selected ? (
              <>
                <Text className="mb-2 text-[22px] font-bold text-[#1A4D3E]">{selected.name}</Text>
                <KBStatusChip label={taskStatusLabel(selected.status)} variant={taskStatusVariant(selected.status)} />
                <Text className="mt-1.5 text-sm text-[#757575]">Farmer: {selected.farmer_name} ({selected.farmer_phone})</Text>
                <Text className="mt-1.5 text-sm text-[#757575]">Project: {selected.program_project_name}</Text>
                <Text className="my-3 text-xl font-bold text-[#D4AF6A]">KES {(selected.payment_value_kes ?? 0).toLocaleString()}</Text>
                {selected.description ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">{selected.description}</Text> : null}
                {selected.notes ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">Notes: {selected.notes}</Text> : null}
                {selected.photo_evidence_url ? <Text className="mt-2 text-[15px] leading-[22px] text-[#333333]">Photo: {selected.photo_evidence_url}</Text> : null}
                {selected.submitted_date ? <Text className="mt-1.5 text-sm text-[#757575]">Submitted: {selected.submitted_date}</Text> : null}
                {selected.rejection_reason ? <Text className="mt-2 text-sm font-semibold text-[#D32F2F]">Rejected: {selected.rejection_reason}</Text> : null}

                {selected.status === 'submitted-for-approval' ? (
                  <View className="mt-4 gap-2.5">
                    <TextInput
                      className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3"
                      placeholder="Approval notes (optional)"
                      value={approvalNotes}
                      onChangeText={setApprovalNotes}
                    />
                    <Button className="h-11 bg-[#2E7D5E]" onPress={approve} disabled={acting}>
                      {acting ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Approve</Text>}
                    </Button>
                    <TextInput
                      className="rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3"
                      placeholder="Rejection reason"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                    />
                    <Button variant="outline" className="h-11" onPress={reject} disabled={acting}>
                      {acting ? <ActivityIndicator color="#D32F2F" /> : <Text className="text-[#D32F2F]">Reject</Text>}
                    </Button>
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
