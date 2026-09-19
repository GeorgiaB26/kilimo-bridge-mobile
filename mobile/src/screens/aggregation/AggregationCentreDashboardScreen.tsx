import React, { useState, useCallback } from 'react';
import {
  View, ScrollView, RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SegmentedButtons } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  getCentreDashboard,
  getCentreInventory,
  getPendingDeliveries,
  receiveCentreDelivery,
} from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { formatCleanDate } from '../../utils/greeting';
import { useAuthStore } from '../../store/authStore';
import { KBCard } from '../../components/ui/KBCard';
import { KeyboardBottomSheet } from '../../components/ui/KeyboardBottomSheet';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { OutboxCentreQcCard } from '../../components/OutboxCentreQcCard';
import {
  CENTRE_QC_EXPECTED_QUALITY_STATUS,
  dismissCentreQcOutbox,
  listPendingCentreQc,
  pushPendingCentreQc,
  submitCentreQcWithOutbox,
  syncAllPendingCentreQc,
  type PendingCentreQcView,
} from '../../services/submitCentreQcOutbox';

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
  const [qcActing, setQcActing] = useState(false);
  const [pendingQc, setPendingQc] = useState<PendingCentreQcView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const resolvedCentreId = centreId || 'self';

  const loadPending = useCallback(async () => {
    setPendingQc(await listPendingCentreQc());
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await syncAllPendingCentreQc();
        await Promise.all([load(), loadPending()]);
      })();
    }, [load, loadPending])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAllPendingCentreQc();
    await Promise.all([load(), loadPending()]);
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

  const applyQc = async (decision: 'approve' | 'reject') => {
    if (!qcModal) return;
    if (decision === 'approve' && (!qcNotes.trim() || !qcPrice.trim())) return;
    if (decision === 'reject' && !qcNotes.trim()) {
      Alert.alert('Notes required', 'Enter a quality assessment note for rejection.');
      return;
    }
    setQcActing(true);
    try {
      const result = await submitCentreQcWithOutbox({
        inventoryId: qcModal.id,
        productName: qcModal.product_name,
        decision,
        expectedQualityStatus: qcModal.quality_status || CENTRE_QC_EXPECTED_QUALITY_STATUS,
        qualityNotes: qcNotes.trim(),
        marketplacePricePerUnit:
          decision === 'approve' ? Number(qcPrice) : undefined,
      });
      await loadPending();
      if (result.mode === 'online') {
        setQcModal(null);
        setQcNotes('');
        await load();
        Alert.alert(
          decision === 'approve' ? 'Approved' : 'Rejected',
          decision === 'approve'
            ? 'Item listed on marketplace. Farmer notified via SMS.'
            : 'Delivery failed QC.'
        );
        return;
      }
      if (result.mode === 'offline') {
        setQcModal(null);
        setQcNotes('');
        Alert.alert('Saved offline', 'QC decision queued for sync.');
        return;
      }
      Alert.alert('Needs your review', result.error);
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not apply quality check'));
    } finally {
      setQcActing(false);
    }
  };

  const handlePush = async (item: PendingCentreQcView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingCentreQc(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.productName} QC updated.`);
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync');
      }
    } finally {
      setPushingId(null);
    }
  };

  if (loading && !stats) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5] p-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text className="mb-4 text-[22px] font-bold text-[#1A4D3E]">Aggregation Centre — {centreName}</Text>

      <View className="mb-2 flex-row gap-2">
        <KBCard style={{ flex: 1 }} elevated={false}>
          <Text className="text-xl font-extrabold text-[#D4AF6A]">{stats?.total_inventory ?? 0} kg</Text>
          <Text className="mt-1 text-xs text-[#757575]">Total Inventory</Text>
        </KBCard>
        <KBCard style={{ flex: 1 }} elevated={false}>
          <Text className="text-xl font-extrabold text-[#D4AF6A]">{deliveries.length}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Awaiting Delivery</Text>
        </KBCard>
      </View>
      <View className="mb-2 flex-row gap-2">
        <KBCard style={{ flex: 1 }} elevated={false}>
          <Text className="text-xl font-extrabold text-[#D4AF6A]">{stats?.awaiting_quality_check ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Awaiting QC</Text>
        </KBCard>
        <KBCard style={{ flex: 1 }} elevated={false}>
          <Text className="text-xl font-extrabold text-[#D4AF6A]">{stats?.ready_for_marketplace ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Ready for Sale</Text>
        </KBCard>
      </View>

      {pendingQc.length > 0 ? (
        <View className="mb-2 mt-4">
          <Text className="mb-2 text-[17px] font-bold text-[#333333]">Queued QC decisions</Text>
          {pendingQc.map((item) => (
            <OutboxCentreQcCard
              key={item.id}
              item={item}
              pushing={pushingId === item.id}
              onPush={() => handlePush(item)}
              onDismiss={() => dismissCentreQcOutbox(item.id).then(loadPending)}
            />
          ))}
        </View>
      ) : null}

      <Text className="mb-2.5 mt-5 text-[17px] font-bold text-[#333333]">Pending deliveries</Text>
      {deliveries.length === 0 ? (
        <Text className="mb-3 text-[#757575]">No approved tasks awaiting delivery.</Text>
      ) : (
        deliveries.map((d) => (
          <KBCard key={d.farmer_task_id} elevated={false}>
            <Text className="text-base font-bold text-[#333333]">{d.farmer_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{d.task_name} · {d.submitted_date ? formatCleanDate(d.submitted_date) : '—'}</Text>
            <Button className="mt-2.5 h-10 bg-[#1A4D3E]" onPress={() => setReceiveModal(d)}>
              <Text className="text-white">Receive delivery</Text>
            </Button>
          </KBCard>
        ))
      )}

      <Text className="mb-2.5 mt-5 text-[17px] font-bold text-[#333333]">Quality check queue</Text>
      <SegmentedButtons
        value={invTab}
        onValueChange={(v) => setInvTab(v as InvTab)}
        buttons={[
          { value: 'awaiting_qc', label: 'Awaiting QC' },
          { value: 'ready_for_marketplace', label: 'Ready' },
          { value: 'all', label: 'All' },
        ]}
        style={{ marginBottom: 12 }}
      />
      {inventory.length === 0 ? (
        <Text className="mb-3 text-[#757575]">No inventory in this queue.</Text>
      ) : (
        inventory.map((item) => (
          <KBCard key={item.id} elevated={false}>
            <Text className="text-base font-bold text-[#333333]">{item.product_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <KBStatusChip label={item.is_marketplace_ready ? 'Ready' : item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
              {item.quality_status === 'pending' ? (
                <Button size="sm" className="bg-[#1A4D3E]" onPress={() => setQcModal(item)}>
                  <Text className="text-white">QC</Text>
                </Button>
              ) : (
                <Text className="font-bold text-[#D4AF6A]">{item.marketplace_price_per_unit ?? 0} KES/unit</Text>
              )}
            </View>
          </KBCard>
        ))
      )}

      <KeyboardBottomSheet
        visible={!!receiveModal}
        onRequestClose={() => setReceiveModal(null)}
        variant="center"
        scrollable
        overlayClassName="flex-1 justify-center bg-black/50 p-5"
        sheetClassName="rounded-xl bg-white p-5"
      >
            <Text className="mb-3 text-xl font-bold text-[#1A4D3E]">Receive delivery</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">Farmer: {receiveModal?.farmer_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">Task: {receiveModal?.task_name}</Text>
            <TextInput className="mb-2.5 mt-2 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Product name" value={product} onChangeText={setProduct} />
            <TextInput className="mb-2.5 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <TextInput className="mb-2.5 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Unit (kg, bags...)" value={unit} onChangeText={setUnit} />
            <TextInput className="mb-2.5 min-h-[72px] rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Notes" value={notes} onChangeText={setNotes} multiline textAlignVertical="top" />
            <Button className="mb-2 h-11 bg-[#1A4D3E]" onPress={confirmReceive}>
              <Text className="text-white">Confirm receive</Text>
            </Button>
            <Button variant="ghost" onPress={() => setReceiveModal(null)}>
              <Text>Cancel</Text>
            </Button>
      </KeyboardBottomSheet>

      <KeyboardBottomSheet
        visible={!!qcModal}
        onRequestClose={() => setQcModal(null)}
        variant="center"
        scrollable
        backdropPressDisabled={qcActing}
        overlayClassName="flex-1 justify-center bg-black/50 p-5"
        sheetClassName="rounded-xl bg-white p-5"
      >
            <Text className="mb-3 text-xl font-bold text-[#1A4D3E]">Quality check</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{qcModal?.product_name} · {qcModal?.quantity_received} {qcModal?.unit}</Text>
            <TextInput className="mb-2.5 mt-2 min-h-[72px] rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Quality assessment (required)" value={qcNotes} onChangeText={setQcNotes} multiline textAlignVertical="top" />
            <TextInput className="mb-2.5 rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-2.5" placeholder="Marketplace price per unit (KES)" value={qcPrice} onChangeText={setQcPrice} keyboardType="decimal-pad" />
            <Button className="mb-2 h-11 bg-[#1A4D3E]" onPress={() => applyQc('approve')} disabled={qcActing}>
              {qcActing ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Confirm approval</Text>}
            </Button>
            <Button variant="outline" className="mb-2 h-11" onPress={() => applyQc('reject')} disabled={qcActing}>
              <Text className="text-[#D32F2F]">Reject QC</Text>
            </Button>
            <Button variant="ghost" onPress={() => setQcModal(null)} disabled={qcActing}>
              <Text>Cancel</Text>
            </Button>
      </KeyboardBottomSheet>
    </ScrollView>
  );
}
