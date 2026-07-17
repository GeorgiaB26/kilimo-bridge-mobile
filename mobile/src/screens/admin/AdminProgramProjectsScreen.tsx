import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { getProgramProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import type { AdminProgramsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AdminProgramsStackParamList, 'ProgramProjectsList'>;

interface ProgramProjectRow {
  id: string;
  name: string;
  program_name?: string;
  region?: string;
  status: string;
  farmers_count?: number;
  total_tasks?: number;
  progress_percent?: number;
}

export function AdminProgramProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const [projects, setProjects] = useState<ProgramProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getProgramProjects();
      setProjects(data.projects ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Could not load program projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading && projects.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Program Projects</Text>
        <KBCard onPress={() => navigation.navigate('PendingTasks')} style={styles.pendingBtn} elevated={false}>
          <View style={styles.pendingRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.pendingText}>Pending approvals</Text>
          </View>
        </KBCard>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <KBCard onPress={() => navigation.navigate('ProgramProjectDetail', { projectId: item.id, name: item.name })}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <KBStatusChip label={item.status} variant={item.status === 'active' ? 'success' : 'info'} />
            </View>
            <Text style={styles.meta}>{item.program_name} · {item.region ?? '—'}</Text>
            <Text style={styles.meta}>{item.farmers_count ?? 0} farmers · {item.total_tasks ?? 0} tasks</Text>
            <KBProgressBar progress={Number(item.progress_percent) || 0} label="Progress" stacked />
          </KBCard>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No program projects yet. Run seed:hierarchy on the backend to create demo data.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  pendingBtn: { marginBottom: 0 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingText: { color: COLORS.primary, fontWeight: '600' },
  error: { color: COLORS.alert, marginBottom: 8 },
  list: { paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24, lineHeight: 22 },
});
