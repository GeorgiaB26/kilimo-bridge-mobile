import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, API_BASE_URL } from '../../constants';
import { getFarmerProjectTasks } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerTaskSubmitModal } from '../../components/farmer/FarmerTaskSubmitModal';
import { useTaskApprovalPolling } from '../../hooks/useTaskApprovalPolling';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyProjectDetail'>;

interface FarmerTaskRow {
  id: string;
  name: string;
  task_order: number;
  payment_value_kes: number;
  status: string;
  due_date?: string;
}

function canMarkComplete(status: string): boolean {
  return ['not-started', 'in-progress', 'rejected'].includes(status);
}

function displayStatus(status: string): string {
  if (status === 'submitted-for-approval') return 'Submitted for Approval';
  return taskStatusLabel(status);
}

export function FarmerHierarchyProjectDetailScreen({ route }: { route: Route }) {
  const { projectId, projectName } = route.params;
  const [tasks, setTasks] = useState<FarmerTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitTask, setSubmitTask] = useState<FarmerTaskRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getFarmerProjectTasks(projectId);
      const list = (data.tasks ?? []) as FarmerTaskRow[];
      list.sort((a, b) => a.task_order - b.task_order);
      setTasks(list);
      setError(list.length === 0 ? 'No tasks assigned yet. Restart the backend to load demo data.' : null);
    } catch (err: unknown) {
      setTasks([]);
      setError(extractApiError(err, 'Could not load tasks — is the backend running?'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useTaskApprovalPolling(tasks, load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const completedCount = tasks.filter((t) => ['approved', 'completed'].includes(t.status)).length;

  if (loading && tasks.length === 0 && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your tasks...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>{projectName}</Text>
        <Text style={styles.subtitle}>
          {tasks.length > 0
            ? `${completedCount}/${tasks.length} tasks approved · Updates every 30 seconds`
            : 'Complete each task and submit photo evidence for payment'}
        </Text>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorApi}>API: {API_BASE_URL}</Text>
            <Text style={styles.errorHint}>
              Fix: stop backend (Ctrl+C), run `cd backend && npm run dev`, then pull to refresh this page.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Your Tasks</Text>

        {tasks.length === 0 && !error ? (
          <Text style={styles.empty}>No tasks assigned for this project yet.</Text>
        ) : (
          tasks.map((item) => {
            const isApproved = item.status === 'approved' || item.status === 'completed';
            const isSubmitted = item.status === 'submitted-for-approval';
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
                  <Text style={styles.submittedHint}>Waiting for manager approval…</Text>
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
              </KBCard>
            );
          })
        )}
      </ScrollView>

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
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: COLORS.muted },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginVertical: 8, lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 8, marginBottom: 12 },
  errorCard: { backgroundColor: '#FFEBEE', padding: 14, borderRadius: 10, marginBottom: 12 },
  errorText: { color: COLORS.alert, fontWeight: '600' },
  errorApi: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
  errorHint: { fontSize: 13, color: COLORS.text, marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nameCol: { flex: 1 },
  badgeCol: { alignItems: 'flex-end' },
  step: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  pay: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  due: { fontSize: 13, color: COLORS.muted },
  submittedHint: { fontSize: 13, color: COLORS.warning, marginTop: 8, fontStyle: 'italic' },
  completeBtn: { marginTop: 12 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  approvedText: { fontSize: 12, fontWeight: '700', color: COLORS.success },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24 },
});
