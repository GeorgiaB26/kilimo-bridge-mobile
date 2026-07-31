import React, { useState, useCallback } from 'react';
import {
  View, ScrollView, RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Button as PaperButton } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
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
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5] p-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text className="mb-3 text-[26px] font-bold text-[#1A4D3E]">Aggregation Centre</Text>
      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} anchor={
        <PaperButton mode="outlined" onPress={() => setMenuOpen(true)} style={{ marginBottom: 12, alignSelf: 'flex-start' }}>{centreName}</PaperButton>
      }>
        {centres.map((c) => (
          <Menu.Item key={c.centre_id} onPress={() => { setCentreId(c.centre_id); setMenuOpen(false); }} title={c.name} />
        ))}
      </Menu>

      <View className="mb-4 flex-row gap-2">
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.total_inventory ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Total received</Text>
        </KBCard>
        <KBCard style={{ flex: 1, marginBottom: 0 }} elevated={false}>
          <Text className="text-[22px] font-extrabold text-[#1A4D3E]">{stats?.awaiting_quality_check ?? 0}</Text>
          <Text className="mt-1 text-xs text-[#757575]">Awaiting QC</Text>
        </KBCard>
      </View>

      <Text className="mb-2 mt-4 text-base font-bold text-[#333333]">Pending deliveries (approved tasks)</Text>
      {deliveries.length === 0 ? (
        <Text className="mb-3 leading-5 text-[#757575]">No approved tasks awaiting delivery. Approve farmer tasks first.</Text>
      ) : (
        deliveries.map((d) => (
          <KBCard key={d.farmer_task_id} onPress={() => setSelectedDelivery(d)} elevated={selectedDelivery?.farmer_task_id === d.farmer_task_id}>
            <Text className="text-base font-bold text-[#333333]">{d.farmer_name}</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">{d.task_name}</Text>
          </KBCard>
        ))
      )}

      {selectedDelivery ? (
        <View className="mb-4 gap-2">
          <Text className="mb-2 mt-4 text-base font-bold text-[#333333]">Receive: {selectedDelivery.farmer_name}</Text>
          <TextInput
            className="rounded-lg border border-[#E0E0E0] bg-white p-3"
            placeholder="Product name"
            value={product}
            onChangeText={setProduct}
          />
          <TextInput
            className="rounded-lg border border-[#E0E0E0] bg-white p-3"
            placeholder="Quantity (kg)"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
          />
          <Button className="h-11 bg-[#1A4D3E]" onPress={receive}>
            <Text className="text-white">Confirm receive</Text>
          </Button>
        </View>
      ) : null}

      <Text className="mb-2 mt-4 text-base font-bold text-[#333333]">Inventory</Text>
      {inventory.map((item) => (
        <KBCard key={item.id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{item.product_name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{item.farmer_name} · {item.quantity_received} {item.unit}</Text>
          <View className="mt-2 flex-row items-center justify-between">
            <KBStatusChip label={item.quality_status} variant={item.is_marketplace_ready ? 'success' : 'pending'} />
            {item.quality_status === 'pending' ? (
              <Button variant="ghost" size="sm" onPress={() => approveQc(item.id)}>
                <Text className="text-[#2E7D5E]">Approve QC</Text>
              </Button>
            ) : null}
          </View>
        </KBCard>
      ))}
    </ScrollView>
  );
}
