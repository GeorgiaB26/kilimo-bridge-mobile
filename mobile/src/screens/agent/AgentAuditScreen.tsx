import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { api } from '../../api/client';

export function AgentAuditScreen() {
  const [logs, setLogs] = useState<Array<{ action: string; category: string; created_at: string; details: string }>>([]);

  useEffect(() => {
    api.get('/agents/audit').then((r) => setLogs(r.data.logs ?? [])).catch(() => {});
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={logs}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={<Text style={styles.title}>My Activity Log</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.action}>{item.action}</Text>
          <Text style={styles.time}>{item.created_at}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No activity logged yet</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 12, marginBottom: 6 },
  action: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  time: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 32 },
});
