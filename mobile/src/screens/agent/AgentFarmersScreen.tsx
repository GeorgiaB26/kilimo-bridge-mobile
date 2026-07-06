import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const [farmers, setFarmers] = useState<Array<{ name: string; phone_number: string; district: string; status: string }>>([]);

  useEffect(() => {
    api.get('/agents/farmers').then((r) => setFarmers(r.data.farmers ?? [])).catch(() => {});
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={farmers}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Farmers in {user?.district ?? 'your region'}</Text>
          <Text style={styles.subtitle}>Aggregation centre: {user?.aggregationCenter ?? '—'}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.detail}>{item.phone_number} · {item.district}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
});
