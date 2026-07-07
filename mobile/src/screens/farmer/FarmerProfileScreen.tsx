import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Button, Divider, List, Switch, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { APP_BUILD } from '../../constants/build';
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
    status: string;
  } | null>(null);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    getFarmerDashboard().then((d) => setFarmer(d.farmer)).catch(() => {});
  }, []);

  const initials = (farmer?.name ?? user?.name ?? '?')
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Surface style={styles.header} elevation={1}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <Text style={styles.name}>{farmer?.name ?? user?.name}</Text>
        <Text style={styles.location}>
          {[farmer?.district, farmer?.sub_county].filter(Boolean).join(' · ') || 'Kenya'}
        </Text>
        <KBStatusChipInline label="Verified Farmer" />
      </Surface>

      <Text style={styles.sectionTitle}>Contact</Text>
      <Surface style={styles.section} elevation={0}>
        <ProfileRow icon="call" label="Phone" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="business" label="Cooperative" value={farmer?.membership_group_name} />
      </Surface>

      <Text style={styles.sectionTitle}>Payment</Text>
      <Surface style={styles.section} elevation={0}>
        <ProfileRow icon="phone-portrait" label="M-Pesa" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="shield-checkmark" label="National ID" value="Verified" verified />
      </Surface>

      <Text style={styles.sectionTitle}>Settings</Text>
      <Surface style={styles.section} elevation={0}>
        <List.Item
          title="Push notifications"
          left={(props) => <List.Icon {...props} icon="bell" color={COLORS.primary} />}
          right={() => (
            <Switch value={notifications} onValueChange={setNotifications} color={COLORS.primary} />
          )}
        />
      </Surface>

      <Button mode="outlined" onPress={logout} textColor={COLORS.alert} style={styles.logout}>
        Sign Out
      </Button>
      <Text style={styles.version}>Kilimo Bridge {APP_BUILD}</Text>
    </ScrollView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  verified,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  verified?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={COLORS.primary} style={styles.rowIcon} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value ?? '—'}</Text>
      </View>
      {verified ? <Ionicons name="checkmark-circle" size={18} color={COLORS.success} /> : null}
    </View>
  );
}

function KBStatusChipInline({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 16, paddingBottom: 40 },
  header: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    marginBottom: 20,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  initials: { fontSize: 32, color: COLORS.accent, fontWeight: '700' },
  name: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  location: { fontSize: 14, color: COLORS.muted, marginTop: 4, marginBottom: 12 },
  chip: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  chipText: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.muted, marginBottom: 8, marginLeft: 4 },
  section: { borderRadius: 12, backgroundColor: COLORS.background, marginBottom: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rowIcon: { marginRight: 12 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 12, color: COLORS.muted },
  rowValue: { fontSize: 15, fontWeight: '500', color: COLORS.text, marginTop: 2 },
  logout: { borderColor: COLORS.alert, marginTop: 8 },
  version: { textAlign: 'center', color: COLORS.muted, fontSize: 12, marginTop: 16 },
});
