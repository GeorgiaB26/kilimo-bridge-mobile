import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import { getUsers } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const ROLE_COLORS: Record<string, string> = {
  super_admin: COLORS.alert,
  admin: COLORS.primary,
  field_officer: COLORS.info,
  farmer: COLORS.success,
};

export function AdminUsersScreen() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<Array<{
    name: string;
    phone_number: string;
    role: string;
    district?: string;
    status: string;
  }>>([]);

  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'admin') {
      getUsers().then((d) => setUsers(d.users ?? [])).catch(() => {});
    }
  }, [user?.role]);

  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    return (
      <View style={styles.denied}>
        <Text style={styles.deniedText}>You don't have permission to view users.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={users}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={<Text style={styles.title}>Platform Users</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={[styles.role, { color: ROLE_COLORS[item.role] ?? COLORS.muted }]}>
              {item.role.replace('_', ' ')}
            </Text>
          </View>
          <Text style={styles.phone}>{item.phone_number}</Text>
          {item.district ? <Text style={styles.district}>District: {item.district}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  role: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  phone: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  district: { fontSize: 12, color: COLORS.info, marginTop: 2 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedText: { color: COLORS.muted, fontSize: 16, textAlign: 'center' },
});
