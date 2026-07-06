import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants';
import { useAuthStore } from '../../store/authStore';

export function AdminProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>
          {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.role}>{user?.role?.replace('_', ' ')}</Text>
      <View style={styles.card}>
        <Row label="Phone" value={user?.phoneNumber} />
        {user?.district ? <Row label="District" value={user.district} /> : null}
      </View>
      <Text style={styles.permTitle}>Your permissions</Text>
      {getPermissions(user?.role).map((p) => (
        <Text key={p} style={styles.perm}>✓ {p}</Text>
      ))}
      <Button title="Sign Out" onPress={logout} variant="outline" style={styles.logout} />
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function getPermissions(role?: string): string[] {
  switch (role) {
    case 'super_admin':
      return ['Full platform access', 'Manage users', 'CSV import', 'View all farmers', 'Banking H2H', 'Audit logs'];
    case 'admin':
      return ['CSV import', 'View all farmers', 'View users', 'Reports', 'Audit logs'];
    case 'agent':
      return ['Register farmers', 'View regional farmers', 'Payment verification', 'Activity audit log'];
    case 'banking':
      return ['View payment transactions', 'Process M-Pesa via Equity H2H', 'Financial audit trail'];
    case 'farmer':
      return ['View own profile', 'View own projects', 'View own payments'];
    default:
      return [];
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  initials: { fontSize: 28, color: COLORS.accent, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  role: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 20, textTransform: 'capitalize' },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 8, padding: 16, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { color: COLORS.muted },
  rowValue: { fontWeight: '500', color: COLORS.text },
  permTitle: { fontSize: 16, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  perm: { fontSize: 14, color: COLORS.text, marginBottom: 4 },
  logout: { marginTop: 24 },
});
