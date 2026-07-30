import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { Button, List, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { APP_BUILD } from '../../constants/build';
import { useAuthStore } from '../../store/authStore';
import { SyncStatusBanner } from '../../components/SyncStatusBanner';

export function RoleProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can sign in again anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.name}>{user?.name ?? 'User'}</Text>
        <Text style={styles.role}>{user?.role?.replace('_', ' ')}</Text>
      </View>

      <SyncStatusBanner />

      <List.Section>
        <List.Subheader>Account</List.Subheader>
        <List.Item title="Phone" description={user?.phoneNumber} left={(p) => <List.Icon {...p} icon="phone" />} />
        {user?.district ? (
          <List.Item title="District" description={user.district} left={(p) => <List.Icon {...p} icon="map" />} />
        ) : null}
        {user?.aggregationCenter ? (
          <List.Item title="Centre" description={user.aggregationCenter} left={(p) => <List.Icon {...p} icon="store" />} />
        ) : null}
      </List.Section>

      <Divider />

      <List.Section>
        <List.Subheader>App</List.Subheader>
        <List.Item title="Build" description={APP_BUILD} left={(p) => <List.Icon {...p} icon="information" />} />
      </List.Section>

      <Button mode="contained" onPress={handleLogout} buttonColor={COLORS.alert} style={styles.logout}>
        Log out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingBottom: 40 },
  hero: {
    backgroundColor: COLORS.primary,
    padding: 28,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: { fontSize: 22, fontWeight: '700', color: '#fff' },
  role: { fontSize: 14, color: COLORS.accent, marginTop: 4, textTransform: 'capitalize' },
  logout: { margin: 20, borderRadius: 12 },
});
