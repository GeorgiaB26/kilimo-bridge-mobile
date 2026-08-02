import React, { useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import {
  listPendingRegistrations,
  type PendingRegistration,
} from '../../services/offlineRegistrationQueue';
import { pushPendingRegistration, syncAllPendingRegistrations } from '../../services/submitFarmerRegistration';
import { KBCard } from '../../components/ui/KBCard';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { RegisterNewFarmerBanner } from '../../components/agent/RegisterNewFarmerButton';
import { formatFarmerStatus } from '../../utils/farmerStatus';
import type { AgentFarmersStackParamList } from '../../navigation/types';

type FarmerRow = {
  farmer_id: string;
  name: string;
  phone_number: string;
  district: string;
  status: string;
};

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<AgentFarmersStackParamList>>();
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [pending, setPending] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [farmersRes, pendingRegs] = await Promise.all([
        api.get('/agents/farmers'),
        listPendingRegistrations(),
      ]);
      setFarmers(farmersRes.data.farmers ?? []);
      setPending(pendingRegs);
      if (pendingRegs.length > 0) {
        const { synced } = await syncAllPendingRegistrations();
        if (synced > 0) {
          const refreshed = await api.get('/agents/farmers');
          setFarmers(refreshed.data.farmers ?? []);
          setPending(await listPendingRegistrations());
        } else {
          setPending(await listPendingRegistrations());
        }
      }
    } catch {
      setFarmers([]);
      setPending(await listPendingRegistrations());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePushRegistration = async (id: string, name: string) => {
    setPushingId(id);
    try {
      const result = await pushPendingRegistration(id);
      if (result.success) {
        Alert.alert('Synced', `${name} registered. Awaiting PM approval.`);
        await load();
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync registration');
        setPending(await listPendingRegistrations());
      }
    } finally {
      setPushingId(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 p-4"
      data={farmers}
      keyExtractor={(item) => item.farmer_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">
            Farmers in {user?.district ?? 'your region'}
          </Text>
          <Text className="mb-3 text-sm text-[#757575]">
            Aggregation centre: {user?.aggregationCenter ?? '—'}
          </Text>

          <RegisterNewFarmerBanner onPress={() => navigation.navigate('RegisterFarmer')} />

          {pending.length > 0 ? (
            <View className="mb-4">
              <Text className="mb-2 text-[17px] font-bold text-[#333333]">Offline registrations</Text>
              {pending.map((item) => (
                <KBCard key={item.id} elevated={false} style={{ marginBottom: 8 }}>
                  <Text className="text-base font-semibold text-[#333333]">{item.formData.name || 'Unnamed farmer'}</Text>
                  <Text className="mt-0.5 text-[13px] text-[#757575]">
                    {item.formData.phone || 'No phone'} · saved {new Date(item.createdAt).toLocaleString()}
                  </Text>
                  {item.syncError ? (
                    <Text className="mt-1 text-xs text-[#D32F2F]">{item.syncError}</Text>
                  ) : null}
                  <Button
                    className="mt-2 h-10 bg-[#1A4D3E]"
                    disabled={pushingId === item.id}
                    onPress={() => handlePushRegistration(item.id, item.formData.name)}
                  >
                    {pushingId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white">Push Registration</Text>
                    )}
                  </Button>
                </KBCard>
              ))}
            </View>
          ) : null}

          <Text className="mb-2 text-[17px] font-bold text-[#333333]">Registered farmers</Text>
        </View>
      }
      renderItem={({ item }) => {
        const statusInfo = formatFarmerStatus(item.status);
        return (
          <Pressable
            className="mb-2 rounded-lg bg-[#F9F9F9] p-3.5"
            onPress={() => navigation.navigate('FarmerProfile', { farmerId: item.farmer_id, name: item.name })}
          >
            <Text className="text-base font-semibold text-[#333333]">{item.name}</Text>
            <Text className="mt-0.5 text-[13px] text-[#757575]">
              {item.phone_number} · {item.district}
            </Text>
            <View className="mt-2">
              <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Text className="text-[#757575]">No farmers in your region yet. Tap REGISTER NEW FARMER above.</Text>
      }
    />
  );
}
