import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { getFarmerHierarchyProjects, getFarmerProjects } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { useCurrency } from '../../context/CurrencyContext';
import { formatDueDate, formatProjectStatus } from '../../utils/greeting';
import type { FarmerProject } from '../../types/farmerProject';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Tab = 'active' | 'completed';
type Nav = NativeStackNavigationProp<FarmerProjectsStackParamList, 'ProjectsList'>;

interface HierarchyProject {
  id: string;
  name: string;
  program_name?: string;
  status: string;
  task_count?: number;
  completed_task_count?: number;
}

export function FarmerProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const { formatAmount } = useCurrency();
  const [tab, setTab] = useState<Tab>('active');
  const [projects, setProjects] = useState<FarmerProject[]>([]);
  const [hierarchyProjects, setHierarchyProjects] = useState<HierarchyProject[]>([]);
  const [useHierarchy, setUseHierarchy] = useState(false);

  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [hierarchyChecked, setHierarchyChecked] = useState(false);

  const loadHierarchy = useCallback(() => {
    getFarmerHierarchyProjects()
      .then((d) => {
        const list = d.projects ?? [];
        setHierarchyProjects(list);
        setUseHierarchy(true);
        setHierarchyError(list.length === 0 ? 'No program projects assigned. Restart backend to load demo data.' : null);
      })
      .catch((err: unknown) => {
        setHierarchyProjects([]);
        setUseHierarchy(true);
        setHierarchyError(extractApiError(err, 'Could not load program projects'));
      })
      .finally(() => setHierarchyChecked(true));
  }, []);

  useEffect(() => {
    loadHierarchy();
    getFarmerProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {});
  }, [loadHierarchy]);

  if (useHierarchy || hierarchyChecked) {
    const active = hierarchyProjects.filter((p) => p.status !== 'completed');
    const done = hierarchyProjects.filter((p) => p.status === 'completed');
    const shown = tab === 'active' ? active : done;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your program projects</Text>
        <Text style={styles.subtitle}>Tap a project to see your 5 tasks and mark them complete</Text>
        {hierarchyError ? (
          <FarmerOfflineBanner message={hierarchyError} hint="Restart backend, then log out and use Farmer quick login (+254712345678)." />
        ) : null}
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          buttons={[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
          ]}
          style={styles.tabs}
        />
        <FlatList
          style={styles.list}
          data={shown}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const total = Number(item.task_count) || 1;
            const doneCount = Number(item.completed_task_count) || 0;
            const progress = Math.round((100 * doneCount) / total);
            return (
              <KBCard onPress={() => navigation.navigate('HierarchyProjectDetail', { projectId: item.id, projectName: item.name })}>
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
                </View>
                <Text style={styles.hierarchyMeta}>{item.program_name}</Text>
                <KBProgressBar progress={progress} label={`${doneCount}/${total} tasks`} stacked />
              </KBCard>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No program projects assigned yet.</Text>}
        />
      </View>
    );
  }

  const filtered = projects.filter((p) =>
    tab === 'active' ? p.status !== 'Completed' : p.status === 'Completed'
  );

  const openDetail = (project: FarmerProject) => {
    navigation.navigate('ProjectDetail', { project });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Projects</Text>
      <Text style={styles.subtitle}>
        {tab === 'active'
          ? 'Training and work you are currently doing'
          : 'Projects you have finished and been paid for'}
      </Text>
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'active', label: 'Ongoing' },
          { value: 'completed', label: 'Finished' },
        ]}
        style={styles.tabs}
        density="medium"
      />
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item, i) => item.id ?? `${item.project_name}-${i}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const statusInfo = formatProjectStatus(item.status ?? '');
          const isComplete = item.status === 'Completed';
          const progress = Number(item.completion_percentage) || 0;
          const amount = Number(item.payment_amount) || 0;
          return (
            <KBCard onPress={() => openDetail(item)}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.project_name}</Text>
                <View style={styles.rowEnd}>
                  <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
                  <Ionicons name="chevron-forward" size={20} color={COLORS.muted} style={styles.chevron} />
                </View>
              </View>
              <Text style={styles.paymentLabel}>Payment amount</Text>
              <Text style={styles.amount}>{formatAmount(amount)}</Text>
              {!isComplete ? (
                <KBProgressBar
                  progress={progress}
                  label={`${progress}% done`}
                  rightLabel={item.due_date ? `Due ${formatDueDate(item.due_date)}` : undefined}
                  stacked
                />
              ) : (
                <Text style={styles.completedNote}>Payment transferred to your M-Pesa</Text>
              )}
            </KBCard>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {tab === 'active' ? 'No ongoing projects' : 'No finished projects yet'}
            </Text>
            <Text style={styles.empty}>
              {tab === 'active'
                ? 'When your cooperative assigns you work, it will appear here.'
                : 'Completed projects and payments will show here.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginTop: 4, marginBottom: 16, lineHeight: 20 },
  tabs: { marginBottom: 16 },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chevron: { marginLeft: 4 },
  name: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  hierarchyMeta: { fontSize: 13, color: COLORS.muted, marginTop: 4, marginBottom: 8 },
  paymentLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.3 },
  amount: { fontSize: 24, fontWeight: '800', color: COLORS.accent, marginTop: 2, marginBottom: 8 },
  completedNote: { fontSize: 14, lineHeight: 22, color: COLORS.success, marginTop: 12, fontWeight: '500' },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  errorCard: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 12 },
  errorText: { color: COLORS.alert, fontWeight: '600', fontSize: 14 },
  errorHint: { color: COLORS.muted, fontSize: 13, marginTop: 6 },
});
