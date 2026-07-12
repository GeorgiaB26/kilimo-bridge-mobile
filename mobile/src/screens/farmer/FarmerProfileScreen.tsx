import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Button, Divider, List, Switch, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { APP_BUILD } from '../../constants/build';
import { getFarmerDashboard } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { getLocalizedGreeting } from '../../utils/greeting';
import { useCurrency } from '../../context/CurrencyContext';

export function FarmerProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { currency, currencyInfo, selectCountry } = useCurrency();
  const [farmer, setFarmer] = useState<{
    name: string;
    phone_number: string;
    country: string;
    district: string;
    sub_county: string;
    membership_group_name: string;
    aggregation_center: string | null;
    kb_farmer_id: string | null;
    picture_url: string | null;
    status: string;
  } | null>(null);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    getFarmerDashboard().then((d) => {
      setFarmer(d.farmer);
      if (d.farmer?.country) selectCountry(d.farmer.country);
    }).catch(() => {});
  }, [selectCountry]);

  const displayName = farmer?.name ?? user?.name ?? 'Farmer';
  const country = farmer?.country ?? 'Kenya';
  const greeting = getLocalizedGreeting(country, displayName);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <ProfileAvatar
          name={displayName}
          pictureUrl={farmer?.picture_url}
          size="hero"
        />
        <View style={styles.greetingCard}>
          <Text style={styles.greetingNative}>{greeting.primary}</Text>
          <Text style={styles.greetingEnglish}>{greeting.secondary}</Text>
          <Text style={styles.languageTag}>{greeting.languageName}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.location}>
          {[farmer?.district, farmer?.sub_county, country].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.chip}>
          <Ionicons name="shield-checkmark" size={14} color={COLORS.success} />
          <Text style={styles.chipText}>Verified Farmer</Text>
        </View>
        <Text style={styles.currencyBadge}>{currencyInfo.name} ({currency})</Text>
      </View>

      {farmer?.kb_farmer_id ? (
        <>
          <Text style={styles.sectionTitle}>Kilimo Bridge ID</Text>
          <Surface style={styles.idCard} elevation={0}>
            <Text style={styles.idValue}>{farmer.kb_farmer_id}</Text>
          </Surface>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Contact</Text>
      <Surface style={styles.section} elevation={0}>
        <ProfileRow icon="call" label="Phone" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="business" label="Cooperative" value={farmer?.membership_group_name} />
        {farmer?.aggregation_center ? (
          <>
            <Divider />
            <ProfileRow icon="location" label="Aggregation centre" value={farmer.aggregation_center} />
          </>
        ) : null}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 16, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 20,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    marginBottom: 20,
  },
  greetingCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  greetingNative: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
  },
  greetingEnglish: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    textAlign: 'center',
  },
  languageTag: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: { fontSize: 24, fontWeight: '700', color: '#FFFFFF', marginTop: 4 },
  location: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4, marginBottom: 12, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  currencyBadge: {
    fontSize: 12,
    color: COLORS.accent,
    marginTop: 10,
    fontWeight: '600',
  },
  idCard: {
    borderRadius: 12,
    backgroundColor: COLORS.background,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  idValue: { fontSize: 20, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },
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
