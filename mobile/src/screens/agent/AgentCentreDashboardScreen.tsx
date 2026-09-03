import React, { useState, useCallback } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getCentreDashboard, getCentreInventory, receiveCentreDelivery } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';
import { KBCard } from '../../components/ui/KBCard';
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
  const [pendingQc, setPendingQc] = useState<PendingCentreQcView[]>([]);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const centreLabel = user?.aggregationCenter ?? 'Your centre';

  const loadPending = useCallback(async () => {
    setPendingQc(await listPendingCentreQc());
  }, []);

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

  const handleQcResult = async (
    result: Awaited<ReturnType<typeof submitCentreQcWithOutbox>>,
    decision: 'approve' | 'reject'
  ) => {
    await loadPending();
    if (result.mode === 'online') {
      await load();
      return;
    }
    if (result.mode === 'offline') {
      Alert.alert(
        'Saved offline',
        `QC ${decision === 'approve' ? 'approval' : 'rejection'} queued for sync.`
      );
      return;
    }
    Alert.alert('Needs your review', result.error);
  };

  const applyQc = async (item: { id: string; product_name: string; quality_status: string }, decision: 'approve' | 'reject') => {
    setActingId(item.id);
    try {
      const result = await submitCentreQcWithOutbox({
        inventoryId: item.id,
        productName: item.product_name,
        decision,
        expectedQualityStatus: item.quality_status || CENTRE_QC_EXPECTED_QUALITY_STATUS,
        marketplacePricePerUnit: decision === 'approve' ? 100 : undefined,
        qualityNotes: decision === 'reject' ? 'Rejected at centre QC' : undefined,
      });
      await handleQcResult(result, decision);
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not apply quality check'));
    } finally {
      setActingId(null);
    }
  };

  const handlePush = async (item: PendingCentreQcView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingCentreQc(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert('Synced', `${item.productName} QC ${item.decision === 'approve' ? 'approved' : 'rejected'}.`);
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
    <ScrollView
      className="flex-1 bg-[#F5F5F5] p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-2xl font-bold text-[#1A4D3E]">Aggregation Centre</Text>
      <Text className="mb-4 text-sm text-[#757575]">{centreLabel}</Text>

      <View className="mb-2 flex-row gap-2">
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.total_inventory ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Total received</Text>
        </KBCard>
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.awaiting_quality_check ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Awaiting QC</Text>
        </KBCard>
      </View>
      <View className="mb-2 flex-row gap-2">
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.ready_for_marketplace ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Marketplace ready</Text>
        </KBCard>
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.farmers_served ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Farmers served</Text>
        </KBCard>
      </View>

      {pendingQc.length > 0 ? (
        <View className="mb-2 mt-4">
          <Text className="mb-2 text-base font-bold text-[#333333]">Queued QC decisions</Text>
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

      <Text className="mb-2 mt-5 text-base font-bold text-[#333333]">Receive delivery</Text>
      <TextInput
        className="mb-2 rounded-lg border border-[#E0E0E0] bg-white p-3"
        placeholder="Farmer ID"
        value={farmerId}
        onChangeText={setFarmerId}
      />
      <TextInput
        className="mb-2 rounded-lg border border-[#E0E0E0] bg-white p-3"
        placeholder="Product name"
        value={product}
        onChangeText={setProduct}
      />
      <TextInput
        className="mb-2 rounded-lg border border-[#E0E0E0] bg-white p-3"
        placeholder="Quantity (kg)"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
      />
      <Button size="pill" className="mb-2 bg-[#1A4D3E]" onPress={receiveDelivery} disabled={receiving}>
        {receiving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="font-semibold text-white">Log delivery</Text>
        )}
      </Button>

      <Text className="mb-2 mt-5 text-base font-bold text-[#333333]">Inventory</Text>
      {inventory.length === 0 ? (
        <Text className="mb-6 text-[#757575]">No inventory logged yet.</Text>
      ) : (
        inventory.map((item) => (
          <KBCard key={item.id} elevated={false}>
            <Text className="text-base font-bold text-[#333333]">{item.product_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
            <View className="mt-2 flex-row items-center justify-between">
              <KBStatusChip label={item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
              {item.quality_status === 'pending' ? (
                <View className="flex-row gap-2">
                  <Button
                    variant="ghost"
                    size="pill"
                    disabled={actingId === item.id}
                    onPress={() => applyQc(item, 'approve')}
                  >
                    <Text className="font-semibold text-[#2E7D5E]">Approve QC</Text>
                  </Button>
                  <Button
                    variant="ghost"
                    size="pill"
                    disabled={actingId === item.id}
                    onPress={() => applyQc(item, 'reject')}
                  >
                    <Text className="font-semibold text-[#D32F2F]">Reject</Text>
                  </Button>
                </View>
              ) : null}
            </View>
          </KBCard>
        ))
      )}
    </ScrollView>
  );
}
