import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { approveFarmerTask, getPendingFarmerTasks, rejectFarmerTask } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

interface PendingTask {
  id: string;
  name: string;
  farmer_name?: string;
  program_project_name?: string;
  payment_value_kes?: number;
  submitted_date?: string;
  notes?: string;
  photo_evidence_url?: string;
}

export function AdminPendingTasksScreen() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPendingFarmerTasks();
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
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

  const approve = async (id: string) => {
    setActing(id);
    try {
      await approveFarmerTask(id);
      await load();
      Alert.alert('Approved', 'Task approved — farmer will see payment pending.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    } finally {
      setActing(null);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim()) {
      Alert.alert('Reason required', 'Enter a rejection reason for the farmer.');
      return;
    }
    setActing(id);
    try {
      await rejectFarmerTask(id, rejectReason.trim());
      setRejectReason('');
      setExpandedId(null);
      await load();
      Alert.alert('Rejected', 'Farmer can resubmit after rework.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not reject'));
    } finally {
      setActing(null);
    }
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
      <Text style={styles.title}>Pending task approvals</Text>
      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <KBCard onPress={() => setExpandedId(expanded ? null : item.id)}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <KBStatusChip label="Submitted" variant="pending" />
              </View>
              <Text style={styles.meta}>{item.farmer_name} · {item.program_project_name}</Text>
              <Text style={styles.meta}>KES {(item.payment_value_kes ?? 0).toLocaleString()}</Text>
              {expanded ? (
                <View style={styles.detail}>
                  {item.notes ? <Text style={styles.notes}>Notes: {item.notes}</Text> : null}
                  {item.photo_evidence_url ? <Text style={styles.notes}>Photo: {item.photo_evidence_url}</Text> : null}
                  <View style={styles.actions}>
                    <Button
                      mode="contained"
                      onPress={() => approve(item.id)}
                      loading={acting === item.id}
                      buttonColor={COLORS.success}
                      style={styles.actionBtn}
                    >
                      Approve
                    </Button>
                    <TextInput
                      style={styles.input}
                      placeholder="Rejection reason"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                    />
                    <Button mode="outlined" onPress={() => reject(item.id)} loading={acting === item.id} textColor={COLORS.alert}>
                      Reject
                    </Button>
                  </View>
                </View>
              ) : null}
            </KBCard>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No tasks awaiting approval.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  list: { paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  detail: { marginTop: 12, gap: 8 },
  notes: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  actions: { gap: 8, marginTop: 8 },
  actionBtn: { marginBottom: 4 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, backgroundColor: COLORS.background },
  empty: { textAlign: 'center', color: COLORS.muted, padding: 24 },
});
