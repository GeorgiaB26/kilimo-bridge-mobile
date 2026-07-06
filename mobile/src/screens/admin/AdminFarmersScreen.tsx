import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { getFarmers } from '../../api/client';

export function AdminFarmersScreen() {
  const [farmers, setFarmers] = useState<Array<{
    name: string;
    phone_number: string;
    district: string;
    membership_group_name: string;
    status: string;
  }>>([]);

  useEffect(() => {
    getFarmers(50).then((d) => setFarmers(d.farmers ?? [])).catch(() => {});
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={farmers}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={<Text style={styles.title}>All Farmers</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.detail}>{item.phone_number} · {item.district}</Text>
          <Text style={styles.coop}>{item.membership_group_name}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  detail: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  coop: { fontSize: 12, color: COLORS.info, marginTop: 2 },
});
