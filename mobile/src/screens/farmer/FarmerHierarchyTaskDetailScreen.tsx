import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, Alert, TextInput, RefreshControl, Image, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  getFarmerHierarchyTask,
  getFarmerTaskApprovalStatus,
  submitFarmerTaskCompletion,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import { uploadPhotoToR2 } from '../../services/uploadToR2';
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
  const [localPhotoReady, setLocalPhotoReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wasSubmitted, setWasSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFarmerHierarchyTask(farmerTaskId);
      setTask(data);
      setLocalPhotoReady(false);
      if (
        data.photo_evidence_url?.startsWith('data:') ||
        data.photo_evidence_url?.startsWith('file:') ||
        data.photo_evidence_url?.startsWith('http')
      ) {
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
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setLocalPhotoReady(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submit = async () => {
    if (!photoUri || !localPhotoReady) {
      Alert.alert('Photo required', 'Please take or choose a photo before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadPhotoToR2({
        purpose: 'task_evidence',
        localUri: photoUri,
        farmerTaskId,
      });
      await submitFarmerTaskCompletion(farmerTaskId, {
        notes: notes.trim() || undefined,
        photo_url: uploaded.objectKey,
      });
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
      className="flex-1 bg-[#F5F5F5] p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {task ? (
        <>
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-[22px] font-bold text-[#1A4D3E]">{task.name}</Text>
            {isApproved ? (
              <View className="flex-row items-center gap-1 rounded-full bg-[#E8F5E9] px-2.5 py-1">
                <Ionicons name="checkmark-circle" size={20} color="#2E7D5E" />
                <Text className="text-xs font-bold text-[#2E7D5E]">Approved</Text>
              </View>
            ) : (
              <KBStatusChip
                label={task.status === 'submitted-for-approval' ? 'Submitted for Approval' : taskStatusLabel(task.status)}
                variant={taskStatusVariant(task.status)}
              />
            )}
          </View>
          <Text className="mt-1 text-sm text-[#757575]">{task.program_project_name}</Text>
          <Text className="mt-3 text-lg font-bold text-[#D4AF6A]">
            Payment: KES {task.payment_value_kes?.toLocaleString()}
          </Text>
          {task.description ? (
            <Text className="mt-3 text-[15px] leading-[22px] text-[#333333]">{task.description}</Text>
          ) : null}
          {task.rejection_reason ? (
            <Text className="mt-3 text-sm font-semibold text-[#D32F2F]">Rework needed: {task.rejection_reason}</Text>
          ) : null}
          {wasSubmitted && task.status === 'submitted-for-approval' ? (
            <Text className="mt-3 text-[13px] italic text-[#1976D2]">Checking approval status every 30 seconds…</Text>
          ) : null}

          {canSubmit ? (
            <View className="mt-5 gap-2">
              <Text className="mt-2 text-[13px] font-semibold text-[#757575]">Photo evidence</Text>
              {photoUri ? (
                <Image source={{ uri: photoUri }} className="mb-2 h-[180px] w-full rounded-lg" />
              ) : null}
              <Button variant="outline" className="mt-2 h-12" onPress={() => pickImage(Platform.OS !== 'web')}>
                <Text>{Platform.OS === 'web' ? 'Choose photo' : 'Camera / Gallery'}</Text>
              </Button>
              <Text className="mt-2 text-[13px] font-semibold text-[#757575]">Notes</Text>
              <TextInput
                className="min-h-20 rounded-lg border border-[#E0E0E0] bg-white p-3"
                multiline
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe your work..."
              />
              <Button className="mt-2 h-12 bg-[#1A4D3E]" disabled={submitting} onPress={submit}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white">Submit for approval</Text>
                )}
              </Button>
            </View>
          ) : null}
        </>
      ) : (
        <Text className="p-6 text-center text-[#757575]">Task not found.</Text>
      )}
    </ScrollView>
  );
}
