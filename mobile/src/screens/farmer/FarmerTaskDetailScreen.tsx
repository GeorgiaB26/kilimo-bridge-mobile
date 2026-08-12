import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from 'react-native-paper';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getFarmerAssignedTasks, getFarmerHierarchyTask } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { formatCleanDate, formatDisplayDate } from '../../utils/greeting';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskQcFailureCard } from '../../components/farmer/FarmerTaskQcFailureCard';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import { useCurrency } from '../../context/CurrencyContext';
import type { FarmerRootStackParamList } from '../../navigation/types';

type DetailRoute = RouteProp<FarmerRootStackParamList, 'TaskDetail'>;
type DetailNav = NativeStackNavigationProp<FarmerRootStackParamList, 'TaskDetail'>;

type TaskDetail = {
  id: string;
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
  source?: 'hierarchy' | 'agent_assignment';
};

function normalizeStatus(status: string): string {
  return status.replace(/_/g, '-');
}

function canResubmit(status: string): boolean {
  return ['not-started', 'in-progress', 'rejected'].includes(normalizeStatus(status));
}

function evidenceUri(task: TaskDetail): string | null {
  const url = (task.photo_evidence_url ?? task.photo_url)?.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) return url;
  return null;
}

export function FarmerTaskDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<DetailNav>();
  const { taskId, fromNotification } = route.params;
  const { formatAmount } = useCurrency();

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      let loaded: TaskDetail | null = null;
      const listRes = await getFarmerAssignedTasks();
      const fromList = (listRes.tasks ?? []).find(
        (row: TaskDetail) => String(row.id) === taskId
      ) as TaskDetail | undefined;

      if (fromList?.source !== 'agent_assignment') {
        try {
          const detail = await getFarmerHierarchyTask(taskId);
          loaded = {
            ...(fromList ?? {}),
            ...detail,
            id: String(detail.id ?? taskId),
            name: String(detail.name ?? fromList?.name ?? 'Task'),
            status: String(detail.status ?? fromList?.status ?? 'not-started'),
            assigned_by_name: fromList?.assigned_by_name ?? detail.assigned_by_name,
            program_project_name:
              fromList?.program_project_name ?? detail.program_project_name,
            source: 'hierarchy',
          };
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status !== 403 && status !== 404) throw err;
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
      setError(extractApiError(err, 'Failed to load task details'));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

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
  const showAction = isQcFailed && canResubmit(task.status);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
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
          <Text style={styles.value}>
            {task.due_date ? formatCleanDate(task.due_date) : 'No deadline set'}
          </Text>
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

        {photoUrl ? (
          <View style={styles.block}>
            <Text style={styles.label}>Submitted evidence</Text>
            <Image source={{ uri: photoUrl }} style={styles.evidenceImage} resizeMode="cover" />
          </View>
        ) : null}

        {showAction ? (
          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            onPress={() => setSubmitOpen(true)}
            style={styles.actionBtn}
          >
            Review & take action
          </Button>
        ) : null}

        {task.source === 'agent_assignment' ? (
          <Text className="mt-4 text-sm text-muted-foreground">
            This is a field agent reminder — photo evidence is managed through program tasks.
          </Text>
        ) : null}
      </ScrollView>

      <FarmerTaskSubmitModal
        task={submitOpen && task.source !== 'agent_assignment' ? task : null}
        visible={submitOpen}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={async () => {
          setSubmitOpen(false);
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
});
