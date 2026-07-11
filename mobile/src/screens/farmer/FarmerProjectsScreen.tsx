import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { COLORS } from '../../constants';
import { getFarmerProjects } from '../../api/client';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { formatDueDate, formatProjectStatus } from '../../utils/greeting';

type Tab = 'active' | 'completed';

export function FarmerProjectsScreen() {
  const [tab, setTab] = useState<Tab>('active');
  const [projects, setProjects] = useState<Array<{
    project_name: string;
    payment_amount: number;
    status: string;
    completion_percentage: number;
    due_date: string;
    start_date?: string;
  }>>([]);

  useEffect(() => {
    getFarmerProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {});
  }, []);

  const filtered = projects.filter((p) =>
    tab === 'active' ? p.status !== 'Completed' : p.status === 'Completed'
  );

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
        data={filtered}
        keyExtractor={(item, i) => `${item.project_name}-${i}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const statusInfo = formatProjectStatus(item.status);
          const isComplete = item.status === 'Completed';
          return (
            <KBCard>
              <View style={styles.row}>
                <Text style={styles.name}>{item.project_name}</Text>
                <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
              </View>
              <Text style={styles.paymentLabel}>Payment amount</Text>
              <Text style={styles.amount}>{item.payment_amount?.toLocaleString()} KES</Text>
              {!isComplete ? (
                <>
                  <KBProgressBar
                    progress={item.completion_percentage}
                    label={`${item.completion_percentage}% done`}
                  />
                  <Text style={styles.due}>Due by {formatDueDate(item.due_date)}</Text>
                </>
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
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 18, fontWeight: '700', color: COLORS.text, flex: 1 },
  paymentLabel: { fontSize: 12, fontWeight: '600', color: COLORS.muted, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.3 },
  amount: { fontSize: 24, fontWeight: '800', color: COLORS.accent, marginTop: 2 },
  due: { fontSize: 14, color: COLORS.text, marginTop: 10, fontWeight: '500' },
  completedNote: { fontSize: 14, color: COLORS.success, marginTop: 10, fontWeight: '500' },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 14, lineHeight: 20 },
});
