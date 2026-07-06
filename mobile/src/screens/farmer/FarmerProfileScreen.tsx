import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants';
import { getFarmerDashboard } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function FarmerProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [farmer, setFarmer] = useState<{
    name: string;
    phone_number: string;
    district: string;
    sub_county: string;
    membership_group_name: string;
    id_number: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    getFarmerDashboard().then((d) => setFarmer(d.farmer)).catch(() => {});
  }, []);

  const initials = (farmer?.name ?? user?.name ?? '?')
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name}>{farmer?.name ?? user?.name}</Text>
      <Text style={styles.role}>Farmer</Text>
      <View style={styles.card}>
        <Row label="Phone" value={farmer?.phone_number ?? user?.phoneNumber} />
        <Row label="District" value={farmer?.district} />
        <Row label="Sub-County" value={farmer?.sub_county} />
        <Row label="Cooperative" value={farmer?.membership_group_name} />
        <Row label="National ID" value={farmer?.id_number ? '✓ Verified' : '—'} />
        <Row label="M-Pesa" value={farmer?.phone_number ?? user?.phoneNumber} />
        <Row label="Status" value={farmer?.status} />
      </View>
      <Button title="Sign Out" onPress={logout} variant="outline" style={styles.logout} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  initials: { fontSize: 28, color: COLORS.accent, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  role: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowLabel: { fontSize: 14, color: COLORS.muted },
  rowValue: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  logout: { marginBottom: 32 },
});
