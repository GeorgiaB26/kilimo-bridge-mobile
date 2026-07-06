import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { getFarmerProjects } from '../../api/client';

export function FarmerProjectsScreen() {
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

  const active = projects.filter((p) => p.status !== 'Completed');
  const completed = projects.filter((p) => p.status === 'Completed');

  return (
    <FlatList
      style={styles.container}
      data={[...active, ...completed]}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <Text style={styles.title}>My Projects</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{item.project_name}</Text>
            <Text style={[styles.status, item.status === 'Completed' && styles.completed]}>
              {item.status}
            </Text>
          </View>
          <Text style={styles.amount}>{item.payment_amount?.toLocaleString()} KES</Text>
          {item.status !== 'Completed' ? (
            <>
              <View style={styles.bar}><View style={[styles.fill, { width: `${item.completion_percentage}%` }]} /></View>
              <Text style={styles.pct}>{item.completion_percentage}% · Due {item.due_date}</Text>
            </>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text, flex: 1 },
  status: { fontSize: 12, fontWeight: '600', color: COLORS.info },
  completed: { color: COLORS.success },
  amount: { fontSize: 14, color: COLORS.accent, fontWeight: '600', marginTop: 4 },
  bar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.success },
  pct: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
});
