import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { getFarmerHierarchyProjects, getFarmerProjectTasks } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../ui/KBCard';
import { KBStatusChip } from '../ui/KBStatusChip';
import { FarmerTaskSubmitModal } from './FarmerTaskSubmitModal';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';

export interface FarmerTaskRow {
  id: string;
  name: string;
  task_order: number;
  payment_value_kes: number;
  status: string;
  due_date?: string;
}

interface Props {
  /** Program project UUID. If omitted, uses the farmer's first hierarchy project. */
  programProjectId?: string;
  /** Hide the section heading when parent already shows project info */
  compact?: boolean;
}

function canMarkComplete(status: string): boolean {
  return ['not-started', 'in-progress', 'rejected'].includes(status);
}

function displayStatus(status: string): string {
  if (status === 'submitted-for-approval') return 'Submitted for Approval';
  return taskStatusLabel(status);
}

export function FarmerProjectTasksSection({ programProjectId, compact }: Props) {
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(programProjectId ?? null);
  const [tasks, setTasks] = useState<FarmerTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<FarmerTaskRow | null>(null);

  const resolveProjectId = useCallback(async (): Promise<string | null> => {
    if (programProjectId) return programProjectId;
    const data = await getFarmerHierarchyProjects();
    const projects = data.projects ?? [];
    return projects[0]?.id ?? null;
  }, [programProjectId]);

  const load = useCallback(async () => {
    try {
      const pid = await resolveProjectId();
      setResolvedProjectId(pid);
      if (!pid) {
        setTasks([]);
        setError('No program tasks assigned yet. Restart the backend if you expect demo tasks.');
        return;
      }
      const data = await getFarmerProjectTasks(pid);
      const list = (data.tasks ?? []) as FarmerTaskRow[];
      list.sort((a, b) => a.task_order - b.task_order);
      setTasks(list);
      setError(list.length === 0 ? 'No tasks for this project yet.' : null);
    } catch (err: unknown) {
      setTasks([]);
      setError(extractApiError(err, 'Could not load tasks'));
    } finally {
      setLoading(false);
    }
  }, [resolveProjectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useTaskApprovalPolling(tasks, load);

  const completedCount = tasks.filter((t) => ['approved', 'completed'].includes(t.status)).length;

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
          </Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tasks.map((item) => {
        const isApproved = item.status === 'approved' || item.status === 'completed';
        const isSubmitted = item.status === 'submitted-for-approval';
        const locked = isApproved || isSubmitted;

        return (
          <KBCard key={item.id} elevated={false}>
            <View style={styles.row}>
              <View style={styles.nameCol}>
                <Text style={styles.step}>Step {item.task_order}</Text>
                <Text style={styles.name}>{item.name}</Text>
              </View>
              <View style={styles.badgeCol}>
                {isApproved ? (
                  <View style={styles.approvedBadge}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                    <Text style={styles.approvedText}>Approved</Text>
                  </View>
                ) : (
                  <KBStatusChip
                    label={displayStatus(item.status)}
                    variant={taskStatusVariant(item.status)}
                  />
                )}
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.pay}>KES {item.payment_value_kes?.toLocaleString()}</Text>
              {item.due_date ? <Text style={styles.due}>Due {item.due_date}</Text> : null}
            </View>

            {isSubmitted ? (
              <Text style={styles.awaiting}>Awaiting approval — you&apos;ll get an SMS when approved</Text>
            ) : null}

            {canMarkComplete(item.status) ? (
              <Button
                mode="contained"
                buttonColor={COLORS.primary}
                onPress={() => setSubmitTask(item)}
                style={styles.completeBtn}
              >
                Mark Complete
              </Button>
            ) : null}

            {locked && !canMarkComplete(item.status) ? (
              <Text style={styles.locked}>Task locked — no further edits</Text>
            ) : null}
          </KBCard>
        );
      })}

      <FarmerTaskSubmitModal
        task={submitTask}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nameCol: { flex: 1 },
  badgeCol: { alignItems: 'flex-end' },
  step: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  pay: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  due: { fontSize: 13, color: COLORS.muted },
  awaiting: { fontSize: 13, color: COLORS.warning, marginTop: 8, fontStyle: 'italic' },
  completeBtn: { marginTop: 12 },
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
});
