import React, { useEffect, useState } from 'react';
import { View, Pressable, Alert, Platform, TextInput, Image } from 'react-native';
import { Bell, X } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KBCard } from '../ui/KBCard';
import { KBStatusChip } from '../ui/KBStatusChip';
import { KeyboardBottomSheet } from '../ui/KeyboardBottomSheet';
import { formatCleanDate } from '../../utils/greeting';
import {
  isSubmittedForApprovalStatus,
  taskStatusLabel,
  taskStatusVariant,
} from '../../utils/taskStatus';
import { extractApiError } from '../../utils/feedback';
import { setTaskReminder, type ReminderType } from '../../utils/taskReminders';
import { setAgentTaskReminder } from '../../api/client';

export type AgentTaskDetail = {
  id: string;
  name: string;
  status: string;
  due_date?: string | null;
  description?: string | null;
  farmer_name?: string;
  program_project_name?: string;
  payment_value_kes?: number;
  notes?: string;
  photo_evidence_url?: string;
  rejection_reason?: string;
  priority?: string;
  source: 'farmer' | 'personal';
  assigned_farmer_names?: string[];
};

const PERSONAL_STATUSES = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
] as const;

interface Props {
  task: AgentTaskDetail | null;
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onUpdateStatus?: (taskId: string, status: string) => Promise<void>;
  onApprove?: (taskId: string) => Promise<void>;
  onReject?: (taskId: string, reason: string) => Promise<void>;
}

export function AgentTaskDetailModal({
  task,
  visible,
  loading,
  onClose,
  onUpdateStatus,
  onApprove,
  onReject,
}: Props) {
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!visible) setRejectReason('');
  }, [visible]);

  if (!task) return null;

  const isApproval = isSubmittedForApprovalStatus(task.status);
  const normalizedPersonalStatus = task.status.replace(/-/g, '_');
  const canEditPersonalStatus =
    task.source === 'personal' && !isApproval && Boolean(onUpdateStatus);
  const photoUrl = task.photo_evidence_url?.trim() || '';

  const handleReminder = async (type: ReminderType) => {
    if (!task.due_date) {
      Alert.alert('No due date', 'This task has no due date for reminders.');
      return;
    }
    await setTaskReminder(task.id, task.name, task.due_date, type);
    if (task.source === 'personal') {
      try {
        await setAgentTaskReminder(task.id, type);
      } catch {
        /* local reminder still set */
      }
    }
    Alert.alert('Reminder set', 'You will be reminded about this task.');
  };

  const handleStatus = async (status: string) => {
    if (!onUpdateStatus) return;
    setActing(true);
    try {
      await onUpdateStatus(task.id, status);
      Alert.alert('Updated', 'Task status saved.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not update task'));
    } finally {
      setActing(false);
    }
  };

  const handleApprove = async () => {
    if (!onApprove) return;
    setActing(true);
    try {
      await onApprove(task.id);
      onClose();
    } catch {
      /* parent surfaces the error */
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason for the farmer.');
      return;
    }
    setActing(true);
    try {
      await onReject(task.id, rejectReason.trim());
      setRejectReason('');
      onClose();
    } catch {
      /* parent surfaces the error */
    } finally {
      setActing(false);
    }
  };

  return (
    <KeyboardBottomSheet
      visible={visible}
      onRequestClose={onClose}
      scrollable
      backdropPressDisabled={acting || loading}
      avoidingViewStyle={Platform.OS === 'web' ? { zIndex: 1000 } : undefined}
      sheetClassName="max-h-[92%] rounded-t-2xl bg-white p-5"
    >
          <View className="mb-4 flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-bold text-[#333333]">{task.name}</Text>
              <View className="mt-2">
                <KBStatusChip
                  label={taskStatusLabel(task.status)}
                  variant={taskStatusVariant(task.status)}
                />
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={24} color="#757575" />
            </Pressable>
          </View>

            {task.description ? (
              <Text className="mb-3 text-sm leading-5 text-[#333333]">{task.description}</Text>
            ) : null}

            <KBCard elevated={false} style={{ marginBottom: 12 }}>
              <Text className="text-xs font-semibold text-[#757575]">Due date</Text>
              <Text className="mt-1 text-base text-[#333333]">
                {task.due_date ? formatCleanDate(task.due_date) : 'No due date'}
              </Text>
              {task.farmer_name ? (
                <>
                  <Text className="mt-3 text-xs font-semibold text-[#757575]">Farmer</Text>
                  <Text className="mt-1 text-base text-[#333333]">{task.farmer_name}</Text>
                </>
              ) : null}
              {task.program_project_name ? (
                <>
                  <Text className="mt-3 text-xs font-semibold text-[#757575]">Program</Text>
                  <Text className="mt-1 text-base text-[#333333]">{task.program_project_name}</Text>
                </>
              ) : null}
              {task.payment_value_kes != null ? (
                <>
                  <Text className="mt-3 text-xs font-semibold text-[#757575]">Payment</Text>
                  <Text className="mt-1 text-base font-semibold text-[#1A4D3E]">
                    KES {task.payment_value_kes.toLocaleString()}
                  </Text>
                </>
              ) : null}
              {task.assigned_farmer_names?.length ? (
                <>
                  <Text className="mt-3 text-xs font-semibold text-[#757575]">Assigned farmers</Text>
                  <Text className="mt-1 text-base text-[#333333]">
                    {task.assigned_farmer_names.join(', ')}
                  </Text>
                </>
              ) : null}
              {task.source === 'personal' && !task.assigned_farmer_names?.length && !task.farmer_name ? (
                <>
                  <Text className="mt-3 text-xs font-semibold text-[#757575]">Assigned to</Text>
                  <Text className="mt-1 text-base text-[#333333]">You (field agent)</Text>
                </>
              ) : null}
            </KBCard>

            {task.rejection_reason ? (
              <View className="mb-3">
                <Text className="text-xs font-semibold text-[#757575]">Rejection reason</Text>
                <Text className="mt-1 text-sm font-semibold leading-5 text-[#D32F2F]">
                  {task.rejection_reason}
                </Text>
              </View>
            ) : null}

            {isApproval || task.notes || photoUrl ? (
              <View className="mb-3">
                <Text className="mb-2 text-sm font-semibold text-[#333333]">
                  {isApproval ? 'Farmer submission' : 'Evidence'}
                </Text>
                {task.notes ? (
                  <View className="mb-3">
                    <Text className="text-xs font-semibold text-[#757575]">Notes</Text>
                    <Text className="mt-1 text-sm leading-5 text-[#333333]">{task.notes}</Text>
                  </View>
                ) : isApproval ? (
                  <Text className="mb-3 text-sm text-[#757575]">No notes provided.</Text>
                ) : null}
                {photoUrl ? (
                  <View>
                    <Text className="mb-2 text-xs font-semibold text-[#757575]">Photo evidence</Text>
                    <Image
                      source={{ uri: photoUrl }}
                      className="h-52 w-full rounded-xl bg-[#F0F0F0]"
                      resizeMode="cover"
                      accessibilityLabel="Task photo evidence"
                    />
                  </View>
                ) : isApproval ? (
                  <Text className="text-sm font-semibold text-[#D32F2F]">Photo required</Text>
                ) : null}
              </View>
            ) : null}

            {canEditPersonalStatus ? (
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-[#333333]">Update status</Text>
                <View className="flex-row flex-wrap gap-2">
                  {PERSONAL_STATUSES.map((s) => (
                    <Pressable
                      key={s.key}
                      onPress={() => handleStatus(s.key)}
                      disabled={acting || loading}
                      className={`rounded-lg px-3 py-2 ${
                        normalizedPersonalStatus === s.key ? 'bg-[#1A4D3E]' : 'bg-[#F0F0F0]'
                      }`}
                    >
                      <Text
                        className={
                          normalizedPersonalStatus === s.key ? 'text-white' : 'text-[#333333]'
                        }
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {task.source === 'personal' && task.due_date && !isApproval ? (
              <View className="mb-4">
                <Text className="mb-2 text-sm font-semibold text-[#333333]">Reminders</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(
                    [
                      { type: '1_day_before' as ReminderType, label: '1 day before' },
                      { type: '3_days_before' as ReminderType, label: '3 days before' },
                      { type: 'on_due_date' as ReminderType, label: 'On due date' },
                    ] as const
                  ).map((r) => (
                    <Pressable
                      key={r.type}
                      onPress={() => handleReminder(r.type)}
                      className="rounded-md bg-[#F0F0F0] px-3 py-2"
                    >
                      <View className="flex-row items-center gap-1">
                        <Bell size={14} color="#333333" />
                        <Text className="text-sm">{r.label}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {isApproval && onApprove && onReject ? (
              <View className="mb-4 gap-2">
                <Button
                  className="h-11 bg-[#2E7D5E]"
                  onPress={handleApprove}
                  disabled={acting || loading}
                >
                  <Text className="text-white">Approve submission</Text>
                </Button>
                <TextInput
                  className="rounded-lg border border-[#E0E0E0] bg-white p-2.5"
                  placeholder="Rejection reason"
                  value={rejectReason}
                  onChangeText={setRejectReason}
                />
                <Button variant="outline" className="h-11" onPress={handleReject} disabled={acting}>
                  <Text className="text-[#D32F2F]">Reject submission</Text>
                </Button>
              </View>
            ) : null}

            <Button variant="outline" className="h-11" onPress={onClose}>
              <Text>Close</Text>
            </Button>
    </KeyboardBottomSheet>
  );
}
