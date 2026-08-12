import React, { useCallback, useState } from 'react';
import { View, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { getAgentCentresInDistrict } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';

type CentreRow = {
  centre_id: string;
  name: string;
  location: string;
};

export function AgentCentresScreen() {
  const district = useAuthStore((s) => s.user?.district);
  const [centres, setCentres] = useState<CentreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getAgentCentresInDistrict();
      setCentres(data.centres ?? []);
      setError(null);
    } catch (err: unknown) {
      setCentres([]);
      setError(extractApiError(err, 'Could not load centres'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F5F5F5]">
        <ActivityIndicator color="#1A4D3E" size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      {error ? (
        <View className="mx-4 mt-4 rounded-md border border-[#D32F2F] bg-[#FFEBEE] px-3 py-2">
          <Text className="text-sm text-[#D32F2F]">{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={centres}
        keyExtractor={(item) => item.centre_id}
        contentContainerClassName="p-4 pb-10"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#1A4D3E" />
        }
        ListHeaderComponent={
          <Text className="mb-3 text-sm text-[#757575]">
            {district
              ? `Aggregation centres in ${district}`
              : 'No district is set on your account — centres cannot be listed.'}
          </Text>
        }
        ListEmptyComponent={
          <View className="rounded-xl bg-white p-5">
            <Text className="text-sm text-[#757575]">
              {district
                ? 'No aggregation centres found for your district.'
                : 'Ask an admin to set your district so centres can appear here.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="mb-3 rounded-xl bg-white px-4 py-3">
            <Text className="text-base font-semibold text-[#333333]">{item.name}</Text>
            {item.location ? (
              <Text className="mt-1 text-sm text-[#757575]">{item.location}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
