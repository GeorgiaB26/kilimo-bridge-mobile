import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants';
import { getFarmerDashboard, claimPayment } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function FarmerDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<{
    pendingAmount: number;
    totalEarnings: number;
    activeProjects: Array<{ project_name: string; completion_percentage: number; payment_amount: number }>;
    nextProject: { project_name: string; due_date: string } | null;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getFarmerDashboard();
      setData(result);
    } catch {
      // offline
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleClaim = async () => {
    try {
      const payments = await import('../../api/client').then((m) => m.getFarmerPayments());
      const pending = payments.payments?.find((p: { payment_status: string }) => p.payment_status === 'Pending');
      if (!pending) {
        Alert.alert('No pending payment', 'You have no payments ready to claim.');
        return;
      }
      const result = await claimPayment(pending.id);
      Alert.alert('Payment Sent!', `${result.amount?.toLocaleString()} KES transferred.\nRef: ${result.reference}`);
      load();
    } catch {
      Alert.alert('Error', 'Could not claim payment. Try again.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] ?? 'Farmer'}</Text>
      <View style={styles.pendingCard}>
        <Text style={styles.pendingLabel}>Pending Payment</Text>
        <Text style={styles.pendingAmount}>
          {(data?.pendingAmount ?? 0).toLocaleString()} KES
        </Text>
        <Text style={styles.pendingStatus}>Ready to claim</Text>
        <Button title="Claim Payment" onPress={handleClaim} style={styles.claimBtn} />
      </View>
      <Text style={styles.sectionTitle}>Active Projects</Text>
      {(data?.activeProjects ?? []).map((p, i) => (
        <View key={i} style={styles.projectCard}>
          <Text style={styles.projectName}>{p.project_name}</Text>
          <Text style={styles.projectAmount}>{p.payment_amount?.toLocaleString()} KES</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${p.completion_percentage}%` }]} />
          </View>
          <Text style={styles.progressText}>{p.completion_percentage}% complete</Text>
        </View>
      ))}
      {data?.nextProject ? (
        <>
          <Text style={styles.sectionTitle}>Next Project</Text>
          <View style={styles.nextCard}>
            <Text style={styles.projectName}>{data.nextProject.project_name}</Text>
            <Text style={styles.dueDate}>Due: {data.nextProject.due_date}</Text>
          </View>
        </>
      ) : null}
      <View style={styles.earningsRow}>
        <Text style={styles.earningsLabel}>Total earned</Text>
        <Text style={styles.earningsValue}>{(data?.totalEarnings ?? 0).toLocaleString()} KES</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  greeting: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  pendingCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  pendingLabel: { color: '#fff', fontSize: 14, opacity: 0.9 },
  pendingAmount: { color: COLORS.accent, fontSize: 36, fontWeight: '700', marginVertical: 8 },
  pendingStatus: { color: '#fff', fontSize: 14, marginBottom: 16 },
  claimBtn: { backgroundColor: COLORS.accent, minWidth: 200 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: COLORS.primary, marginBottom: 12 },
  projectCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
  },
  projectName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  projectAmount: { fontSize: 14, color: COLORS.accent, fontWeight: '600', marginTop: 4 },
  progressBar: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.success },
  progressText: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  nextCard: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, marginBottom: 16 },
  dueDate: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  earningsLabel: { fontSize: 16, color: COLORS.text },
  earningsValue: { fontSize: 18, fontWeight: '700', color: COLORS.accent },
});
