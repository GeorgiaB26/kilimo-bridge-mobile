import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Menu } from 'react-native-paper';
import { COLORS } from '../../constants';
import {
  approveInventoryQuality,
  getAggregationCentres,
  getCentreDashboard,
  getCentreInventory,
  getPendingDeliveries,
  receiveCentreDelivery,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

export function AdminCentreScreen() {
  const [centres, setCentres] = useState<Array<{ centre_id: string; name: string }>>([]);
  const [centreId, setCentreId] = useState('');
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
  const [deliveries, setDeliveries] = useState<Array<{
    farmer_task_id: string;
    farmer_id: string;
    task_id: string;
    farmer_name?: string;
    task_name?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState<typeof deliveries[0] | null>(null);

  const load = useCallback(async () => {
    try {
      const centresData = await getAggregationCentres();
      const list = centresData.centres ?? [];
      setCentres(list);
      const activeId = centreId || list[0]?.centre_id || '';
      if (!centreId && activeId) setCentreId(activeId);
      if (!activeId) return;

      const [dash, inv, pending] = await Promise.all([
        getCentreDashboard(activeId),
        getCentreInventory(activeId),
        getPendingDeliveries(),
      ]);
      setStats(dash);
      setInventory(inv.inventory ?? []);
      setDeliveries(pending.deliveries ?? []);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [centreId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const receive = async () => {
    if (!selectedDelivery || !centreId || !product.trim() || !quantity.trim()) {
      Alert.alert('Missing fields', 'Select a delivery and enter product + quantity.');
      return;
    }
    try {
      await receiveCentreDelivery(centreId, {
        farmer_id: selectedDelivery.farmer_id,
        task_id: selectedDelivery.task_id,
        product_name: product.trim(),
        quantity_received: Number(quantity),
        unit: 'kg',
      });
      setSelectedDelivery(null);
      setProduct('');
      setQuantity('');
      await load();
      Alert.alert('Received', 'Delivery logged. Farmer notified (SMS pilot).');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not receive delivery'));
    }
  };

  const approveQc = async (id: string) => {
    try {
      await approveInventoryQuality(id, { quality_status: 'approved', marketplace_price_per_unit: 100 });
      await load();
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not approve'));
    }
  };

  const centreName = centres.find((c) => c.centre_id === centreId)?.name ?? 'Select centre';

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Aggregation Centre</Text>
      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} anchor={
        <Button mode="outlined" onPress={() => setMenuOpen(true)} style={styles.centreBtn}>{centreName}</Button>
      }>
        {centres.map((c) => (
          <Menu.Item key={c.centre_id} onPress={() => { setCentreId(c.centre_id); setMenuOpen(false); }} title={c.name} />
        ))}
      </Menu>

      <View style={styles.statsRow}>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{stats?.total_inventory ?? 0}</Text>
          <Text style={styles.statLabel}>Total received</Text>
        </KBCard>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{stats?.awaiting_quality_check ?? 0}</Text>
          <Text style={styles.statLabel}>Awaiting QC</Text>
        </KBCard>
      </View>

      <Text style={styles.section}>Pending deliveries (approved tasks)</Text>
      {deliveries.length === 0 ? (
        <Text style={styles.hint}>No approved tasks awaiting delivery. Approve farmer tasks first.</Text>
      ) : (
        deliveries.map((d) => (
          <KBCard key={d.farmer_task_id} onPress={() => setSelectedDelivery(d)} elevated={selectedDelivery?.farmer_task_id === d.farmer_task_id}>
            <Text style={styles.itemTitle}>{d.farmer_name}</Text>
            <Text style={styles.meta}>{d.task_name}</Text>
          </KBCard>
        ))
      )}

      {selectedDelivery ? (
        <View style={styles.form}>
          <Text style={styles.section}>Receive: {selectedDelivery.farmer_name}</Text>
          <TextInput style={styles.input} placeholder="Product name" value={product} onChangeText={setProduct} />
          <TextInput style={styles.input} placeholder="Quantity (kg)" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <Button mode="contained" buttonColor={COLORS.primary} onPress={receive}>Confirm receive</Button>
        </View>
      ) : null}

      <Text style={styles.section}>Inventory</Text>
      {inventory.map((item) => (
        <KBCard key={item.id} elevated={false}>
          <Text style={styles.itemTitle}>{item.product_name}</Text>
          <Text style={styles.meta}>{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
          <View style={styles.row}>
            <KBStatusChip label={item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
            {item.quality_status === 'pending' ? (
              <Button compact onPress={() => approveQc(item.id)} textColor={COLORS.success}>Approve QC</Button>
            ) : null}
          </View>
        </KBCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  centreBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  stat: { flex: 1, marginBottom: 0 },
  statVal: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 16, marginBottom: 8 },
  hint: { color: COLORS.muted, marginBottom: 12, lineHeight: 20 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  form: { gap: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, backgroundColor: COLORS.background },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
});
