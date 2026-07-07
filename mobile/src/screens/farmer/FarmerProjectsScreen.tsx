import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { COLORS } from '../../constants';
import { getFarmerProjects } from '../../api/client';
import { KBCard } from '../../components/ui/KBCard';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

type Tab = 'active' | 'completed';

export function FarmerProjectsScreen() {
  const [tab, setTab] = useState<Tab>('active');
  const [projects, setProjects] = useState<Array<{
    project_name: string;
    payment_amount: number;
    status: string;
    completion_percentage: number;
    due_date: string;
  }>>([]);

  useEffect(() => {
    getFarmerProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {});
  }, []);

  const filtered = projects.filter((p) =>
    tab === 'active' ? p.status !== 'Completed' : p.status === 'Completed'
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Projects</Text>
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
        data={filtered}
        keyExtractor={(item, i) => `${item.project_name}-${i}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable>
            <KBCard>
              <View style={styles.row}>
                <Text style={styles.name}>{item.project_name}</Text>
                <KBStatusChip
                  label={item.status}
                  variant={item.status === 'Completed' ? 'success' : 'info'}
                />
              </View>
              <Text style={styles.amount}>{item.payment_amount?.toLocaleString()} KES</Text>
              {item.status !== 'Completed' ? (
                <>
                  <KBProgressBar progress={item.completion_percentage} />
                  <Text style={styles.due}>Due {item.due_date}</Text>
                </>
              ) : (
                <Text style={styles.due}>Completed</Text>
              )}
            </KBCard>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No {tab} projects</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  tabs: { marginBottom: 16 },
  list: { paddingBottom: 24 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '600', color: COLORS.text, flex: 1, marginRight: 8 },
  amount: { fontSize: 22, fontWeight: '700', color: COLORS.accent, marginTop: 8 },
  due: { fontSize: 13, color: COLORS.muted, marginTop: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
