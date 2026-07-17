import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { assignFarmersToProgramProject, getFarmers, getProgramProject } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import type { AdminProgramsStackParamList } from '../../navigation/types';

type Route = RouteProp<AdminProgramsStackParamList, 'ProgramProjectDetail'>;

export function AdminProgramProjectDetailScreen() {
  const route = useRoute<Route>();
  const { projectId } = route.params;
  const [project, setProject] = useState<{
    name: string;
    program_name?: string;
    region?: string;
    farmers_count?: number;
    tasks?: Array<{ id: string; name: string; task_order: number; payment_value_kes: number }>;
    farmers?: Array<{ farmer_id: string; name: string; status: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getProgramProject(projectId);
      setProject(data);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const assignDemoFarmers = async () => {
    setAssigning(true);
    try {
      const data = await getFarmers(10, 0);
      const ids = (data.farmers ?? []).map((f: { farmer_id: string }) => f.farmer_id);
      if (ids.length === 0) {
        Alert.alert('No farmers', 'Import or register farmers first.');
        return;
      }
      await assignFarmersToProgramProject(projectId, ids);
      await load();
      Alert.alert('Assigned', `${ids.length} farmers assigned to this project.`);
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not assign farmers'));
    } finally {
      setAssigning(false);
    }
  };

  if (loading && !project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>{project?.name}</Text>
      <Text style={styles.meta}>{project?.program_name} · {project?.region ?? '—'}</Text>
      <Text style={styles.meta}>{project?.farmers_count ?? 0} farmers enrolled</Text>

      <Button mode="contained" onPress={assignDemoFarmers} loading={assigning} style={styles.btn} buttonColor={COLORS.primary}>
        Assign first 10 farmers
      </Button>

      <Text style={styles.section}>Tasks (sequence)</Text>
      {(project?.tasks ?? []).map((t) => (
        <KBCard key={t.id} elevated={false}>
          <Text style={styles.taskOrder}>Step {t.task_order}</Text>
          <Text style={styles.taskName}>{t.name}</Text>
          <Text style={styles.taskPay}>KES {t.payment_value_kes?.toLocaleString()}</Text>
        </KBCard>
      ))}

      <Text style={styles.section}>Enrolled farmers</Text>
      {(project?.farmers ?? []).length === 0 ? (
        <Text style={styles.empty}>No farmers assigned yet.</Text>
      ) : (
        (project?.farmers ?? []).map((f) => (
          <KBCard key={f.farmer_id} elevated={false}>
            <View style={styles.row}>
              <Text style={styles.farmerName}>{f.name}</Text>
              <KBStatusChip label={f.status} variant="info" />
            </View>
          </KBCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  meta: { fontSize: 14, color: COLORS.muted, marginTop: 4 },
  btn: { marginVertical: 16 },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  taskOrder: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  taskName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  taskPay: { fontSize: 14, color: COLORS.accent, marginTop: 4, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farmerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  empty: { color: COLORS.muted, marginBottom: 24 },
});
