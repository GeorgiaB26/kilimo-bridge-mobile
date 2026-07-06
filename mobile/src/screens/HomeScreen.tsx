import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { COLORS } from '../constants';
import { getFarmers } from '../api/client';

interface FarmerListItem {
  farmer_id: string;
  name: string;
  phone_number: string;
  district: string;
  membership_group_name: string;
  status: string;
}

export function HomeScreen({ navigation }: { navigation: { navigate: (screen: string) => void } }) {
  const [farmers, setFarmers] = useState<FarmerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadFarmers = async () => {
    try {
      const data = await getFarmers(20);
      setFarmers(data.farmers);
      setTotal(data.total);
    } catch {
      // API may be offline
    }
  };

  useEffect(() => { loadFarmers(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFarmers();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Kilimo Bridge"
        subtitle={`${total.toLocaleString()} farmers registered`}
      />
      <View style={styles.actions}>
        <Button
          title="Register Farmer"
          onPress={() => navigation.navigate('Registration')}
          style={styles.actionBtn}
        />
        <Button
          title="Import CSV"
          onPress={() => navigation.navigate('Admin')}
          variant="secondary"
          style={styles.actionBtn}
        />
      </View>
      <Text style={styles.sectionTitle}>Recent Farmers</Text>
      <FlatList
        data={farmers}
        keyExtractor={(item) => item.farmer_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.farmerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
              </Text>
            </View>
            <View style={styles.farmerInfo}>
              <Text style={styles.farmerName}>{item.name}</Text>
              <Text style={styles.farmerDetail}>{item.phone_number} · {item.district}</Text>
              <Text style={styles.farmerGroup}>{item.membership_group_name}</Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'Active' && styles.activeBadge]}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No farmers yet. Register manually or import a CSV.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionBtn: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.primary, marginBottom: 12 },
  farmerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: COLORS.accent, fontWeight: '700', fontSize: 16 },
  farmerInfo: { flex: 1 },
  farmerName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  farmerDetail: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  farmerGroup: { fontSize: 12, color: COLORS.info, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  activeBadge: { backgroundColor: '#E8F5E9' },
  statusText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 32, fontSize: 14 },
});
