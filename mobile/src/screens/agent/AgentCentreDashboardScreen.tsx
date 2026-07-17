import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';
import { approveInventoryQuality, getCentreDashboard, getCentreInventory, receiveCentreDelivery } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

export function AgentCentreDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<{
    total_inventory: number;
    awaiting_quality_check: number;
    ready_for_marketplace: number;
    farmers_served: number;
  } | null>(null);
  const [inventory, setInventory] = useState<Array<{
    id: string;
    farmer_name?: string;
    product_name: string;
    quantity_received: number;
    unit: string;
    quality_status: string;
    is_marketplace_ready: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [farmerId, setFarmerId] = useState('');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [receiving, setReceiving] = useState(false);

  const centreLabel = user?.aggregationCenter ?? 'Your centre';

  const load = useCallback(async () => {
    try {
      const [dash, inv] = await Promise.all([
        getCentreDashboard(),
        getCentreInventory(),
      ]);
      setStats(dash);
      setInventory(inv.inventory ?? []);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const receiveDelivery = async () => {
    if (!farmerId.trim() || !product.trim() || !quantity.trim()) {
      Alert.alert('Missing fields', 'Enter farmer ID, product, and quantity.');
      return;
    }
    setReceiving(true);
    try {
      await receiveCentreDelivery('self', {
        farmer_id: farmerId.trim(),
        product_name: product.trim(),
        quantity_received: Number(quantity),
        unit: 'kg',
      });
      setFarmerId('');
      setProduct('');
      setQuantity('');
      await load();
      Alert.alert('Received', 'Delivery logged at centre.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not log delivery — use centre ID from admin if needed'));
    } finally {
      setReceiving(false);
    }
  };

  const approveItem = async (id: string) => {
    try {
      await approveInventoryQuality(id, { quality_status: 'approved', marketplace_price_per_unit: 100 });
      await load();
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve quality'));
    }
  };

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Aggregation Centre</Text>
      <Text style={styles.subtitle}>{centreLabel}</Text>

      <View style={styles.statsRow}>
        <KBCard style={styles.statCard} elevated={false}>
          <Text style={styles.statVal}>{stats?.total_inventory ?? 0}</Text>
          <Text style={styles.statLabel}>Total received</Text>
        </KBCard>
        <KBCard style={styles.statCard} elevated={false}>
          <Text style={styles.statVal}>{stats?.awaiting_quality_check ?? 0}</Text>
          <Text style={styles.statLabel}>Awaiting QC</Text>
        </KBCard>
      </View>
      <View style={styles.statsRow}>
        <KBCard style={styles.statCard} elevated={false}>
          <Text style={styles.statVal}>{stats?.ready_for_marketplace ?? 0}</Text>
          <Text style={styles.statLabel}>Marketplace ready</Text>
        </KBCard>
        <KBCard style={styles.statCard} elevated={false}>
          <Text style={styles.statVal}>{stats?.farmers_served ?? 0}</Text>
          <Text style={styles.statLabel}>Farmers served</Text>
        </KBCard>
      </View>

      <Text style={styles.section}>Receive delivery</Text>
      <TextInput style={styles.input} placeholder="Farmer ID" value={farmerId} onChangeText={setFarmerId} />
      <TextInput style={styles.input} placeholder="Product name" value={product} onChangeText={setProduct} />
      <TextInput style={styles.input} placeholder="Quantity (kg)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
      <Button mode="contained" onPress={receiveDelivery} loading={receiving} buttonColor={COLORS.primary} style={styles.btn}>
        Log delivery
      </Button>

      <Text style={styles.section}>Inventory</Text>
      {inventory.length === 0 ? (
        <Text style={styles.empty}>No inventory logged yet.</Text>
      ) : (
        inventory.map((item) => (
          <KBCard key={item.id} elevated={false}>
            <Text style={styles.itemTitle}>{item.product_name}</Text>
            <Text style={styles.meta}>{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
            <View style={styles.row}>
              <KBStatusChip label={item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
              {item.quality_status === 'pending' ? (
                <Button compact onPress={() => approveItem(item.id)} textColor={COLORS.success}>Approve QC</Button>
              ) : null}
            </View>
          </KBCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statCard: { flex: 1, marginBottom: 0 },
  statVal: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 20, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, backgroundColor: COLORS.background, marginBottom: 8 },
  btn: { marginBottom: 8 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  empty: { color: COLORS.muted, marginBottom: 24 },
});
