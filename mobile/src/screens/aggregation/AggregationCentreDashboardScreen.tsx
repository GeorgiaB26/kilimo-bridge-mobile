import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, SegmentedButtons } from 'react-native-paper';
import { COLORS } from '../../constants';
import {
  getCentreDashboard,
  getCentreInventory,
  getPendingDeliveries,
  receiveCentreDelivery,
  approveCentreQuality,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';

type InvTab = 'awaiting_qc' | 'ready_for_marketplace' | 'all';

interface PendingDelivery {
  farmer_task_id: string;
  farmer_id: string;
  task_id: string;
  farmer_name?: string;
  task_name?: string;
  submitted_date?: string;
}

interface InventoryRow {
  id: string;
  farmer_name?: string;
  product_name: string;
  quantity_received: number;
  unit: string;
  quality_status: string;
  is_marketplace_ready: boolean;
  marketplace_price_per_unit?: number;
  received_date?: string;
}

export function AggregationCentreDashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const centreId = user?.aggregationCenterId ?? '';
  const centreName = user?.aggregationCenter ?? 'Aggregation Centre';
  const [stats, setStats] = useState<{
    total_inventory: number;
    awaiting_quality_check: number;
    ready_for_marketplace: number;
    farmers_served: number;
  } | null>(null);
  const [deliveries, setDeliveries] = useState<PendingDelivery[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [invTab, setInvTab] = useState<InvTab>('awaiting_qc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receiveModal, setReceiveModal] = useState<PendingDelivery | null>(null);
  const [qcModal, setQcModal] = useState<InventoryRow | null>(null);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [notes, setNotes] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [qcPrice, setQcPrice] = useState('500');

  const resolvedCentreId = centreId || 'self';

  const load = useCallback(async () => {
    try {
      const cid = centreId || undefined;
      const statusFilter = invTab === 'all' ? undefined : invTab;
      const [dash, pending, inv] = await Promise.all([
        getCentreDashboard(cid),
        getPendingDeliveries(cid),
        getCentreInventory(cid, statusFilter),
      ]);
      setStats(dash);
      setDeliveries(pending.deliveries ?? []);
      setInventory(inv.inventory ?? []);
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [centreId, invTab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmReceive = async () => {
    if (!receiveModal || !product.trim() || !quantity.trim()) return;
    try {
      await receiveCentreDelivery(resolvedCentreId === 'self' ? 'self' : resolvedCentreId, {
        farmer_id: receiveModal.farmer_id,
        task_id: receiveModal.task_id,
        product_name: product.trim(),
        quantity_received: Number(quantity),
        unit,
        notes: notes.trim() || undefined,
      });
      setReceiveModal(null);
      setProduct('');
      setQuantity('');
      setNotes('');
      await load();
      Alert.alert('Received', 'Delivery logged. Farmer notified via SMS.');
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not receive delivery'));
    }
  };

  const confirmQc = async () => {
    if (!qcModal || !qcNotes.trim() || !qcPrice.trim()) return;
    try {
      await approveCentreQuality(centreId || undefined, {
        inventory_id: qcModal.id,
        quality_notes: qcNotes.trim(),
        marketplace_price_per_unit: Number(qcPrice),
      });
      setQcModal(null);
      setQcNotes('');
      await load();
      Alert.alert('Approved', 'Item listed on marketplace. Farmer notified via SMS.');
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
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Aggregation Centre — {centreName}</Text>

      <View style={styles.statsRow}>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{stats?.total_inventory ?? 0} kg</Text>
          <Text style={styles.statLabel}>Total Inventory</Text>
        </KBCard>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{deliveries.length}</Text>
          <Text style={styles.statLabel}>Awaiting Delivery</Text>
        </KBCard>
      </View>
      <View style={styles.statsRow}>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{stats?.awaiting_quality_check ?? 0}</Text>
          <Text style={styles.statLabel}>Awaiting QC</Text>
        </KBCard>
        <KBCard style={styles.stat} elevated={false}>
          <Text style={styles.statVal}>{stats?.ready_for_marketplace ?? 0}</Text>
          <Text style={styles.statLabel}>Ready for Sale</Text>
        </KBCard>
      </View>

      <Text style={styles.section}>Pending deliveries</Text>
      {deliveries.length === 0 ? (
        <Text style={styles.hint}>No approved tasks awaiting delivery.</Text>
      ) : (
        deliveries.map((d) => (
          <KBCard key={d.farmer_task_id} elevated={false}>
            <Text style={styles.itemTitle}>{d.farmer_name}</Text>
            <Text style={styles.meta}>{d.task_name} · {d.submitted_date?.slice(0, 10) ?? '—'}</Text>
            <Button mode="contained" buttonColor={COLORS.primary} onPress={() => setReceiveModal(d)} style={styles.itemBtn}>
              Receive delivery
            </Button>
          </KBCard>
        ))
      )}

      <Text style={styles.section}>Quality check queue</Text>
      <SegmentedButtons
        value={invTab}
        onValueChange={(v) => setInvTab(v as InvTab)}
        buttons={[
          { value: 'awaiting_qc', label: 'Awaiting QC' },
          { value: 'ready_for_marketplace', label: 'Ready' },
          { value: 'all', label: 'All' },
        ]}
        style={styles.tabs}
      />
      {inventory.length === 0 ? (
        <Text style={styles.hint}>No inventory in this queue.</Text>
      ) : (
        inventory.map((item) => (
          <KBCard key={item.id} elevated={false}>
            <Text style={styles.itemTitle}>{item.product_name}</Text>
            <Text style={styles.meta}>{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
            <View style={styles.row}>
              <KBStatusChip label={item.is_marketplace_ready ? 'Ready' : item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
              {item.quality_status === 'pending' ? (
                <Button compact mode="contained" onPress={() => setQcModal(item)}>Approve</Button>
              ) : (
                <Text style={styles.price}>{item.marketplace_price_per_unit ?? 0} KES/unit</Text>
              )}
            </View>
          </KBCard>
        ))
      )}

      <Modal visible={!!receiveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Receive delivery</Text>
            <Text style={styles.meta}>Farmer: {receiveModal?.farmer_name}</Text>
            <Text style={styles.meta}>Task: {receiveModal?.task_name}</Text>
            <TextInput style={styles.input} placeholder="Product name" value={product} onChangeText={setProduct} />
            <TextInput style={styles.input} placeholder="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Unit (kg, bags...)" value={unit} onChangeText={setUnit} />
            <TextInput style={[styles.input, styles.multiline]} placeholder="Notes" value={notes} onChangeText={setNotes} multiline />
            <Button mode="contained" buttonColor={COLORS.primary} onPress={confirmReceive}>Confirm receive</Button>
            <Button mode="text" onPress={() => setReceiveModal(null)}>Cancel</Button>
          </View>
        </View>
      </Modal>

      <Modal visible={!!qcModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Quality check</Text>
            <Text style={styles.meta}>{qcModal?.product_name} · {qcModal?.quantity_received} {qcModal?.unit}</Text>
            <TextInput style={[styles.input, styles.multiline]} placeholder="Quality assessment (required)" value={qcNotes} onChangeText={setQcNotes} multiline />
            <TextInput style={styles.input} placeholder="Marketplace price per unit (KES)" value={qcPrice} onChangeText={setQcPrice} keyboardType="decimal-pad" />
            <Button mode="contained" buttonColor={COLORS.primary} onPress={confirmQc}>Confirm approval</Button>
            <Button mode="text" onPress={() => setQcModal(null)}>Cancel</Button>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stat: { flex: 1 },
  statVal: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  section: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 20, marginBottom: 10 },
  hint: { color: COLORS.muted, marginBottom: 12 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  itemBtn: { marginTop: 10 },
  tabs: { marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  price: { fontWeight: '700', color: COLORS.accent },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: COLORS.background, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: COLORS.surface },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
