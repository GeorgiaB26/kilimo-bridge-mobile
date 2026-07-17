import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { getFarmerHierarchyTasks } from '../../api/client';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyProjectDetail'>;
type Nav = NativeStackNavigationProp<FarmerProjectsStackParamList, 'HierarchyProjectDetail'>;

interface FarmerTaskRow {
  id: string;
  name: string;
  task_order: number;
  payment_value_kes: number;
  status: string;
  due_date?: string;
}

export function FarmerHierarchyProjectDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { projectId, projectName } = route.params;
  const [tasks, setTasks] = useState<FarmerTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFarmerHierarchyTasks({ program_project_id: projectId });
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
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

  if (loading && tasks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{projectName}</Text>
      <Text style={styles.subtitle}>Complete each task in order. Tap a task to submit evidence.</Text>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <KBCard onPress={() => navigation.navigate('HierarchyTaskDetail', { farmerTaskId: item.id, taskName: item.name })}>
            <View style={styles.row}>
              <Text style={styles.step}>Step {item.task_order}</Text>
              <KBStatusChip label={taskStatusLabel(item.status)} variant={taskStatusVariant(item.status)} />
            </View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.pay}>KES {item.payment_value_kes?.toLocaleString()}</Text>
            {item.due_date ? <Text style={styles.due}>Due {item.due_date}</Text> : null}
          </KBCard>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No tasks assigned for this project.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginVertical: 8, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  pay: { fontSize: 16, fontWeight: '700', color: COLORS.accent, marginTop: 6 },
  due: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24 },
});
