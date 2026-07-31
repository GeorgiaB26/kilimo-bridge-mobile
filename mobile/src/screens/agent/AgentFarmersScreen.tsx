import React, { useState, useEffect } from 'react';
import { View, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export function AgentFarmersScreen() {
  const user = useAuthStore((s) => s.user);
  const [farmers, setFarmers] = useState<Array<{ name: string; phone_number: string; district: string; status: string }>>([]);

  useEffect(() => {
    api.get('/agents/farmers').then((r) => setFarmers(r.data.farmers ?? [])).catch(() => {});
  }, []);

  return (
    <FlatList
      className="flex-1 p-4"
      data={farmers}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <View>
          <Text className="text-[22px] font-bold text-[#1A4D3E]">
            Farmers in {user?.district ?? 'your region'}
          </Text>
          <Text className="mb-4 text-sm text-[#757575]">
            Aggregation centre: {user?.aggregationCenter ?? '—'}
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-2 rounded-lg bg-[#F9F9F9] p-3.5">
          <Text className="text-base font-semibold text-[#333333]">{item.name}</Text>
          <Text className="mt-0.5 text-[13px] text-[#757575]">
            {item.phone_number} · {item.district}
          </Text>
        </View>
      )}
    />
  );
}
