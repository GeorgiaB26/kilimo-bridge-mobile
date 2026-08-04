import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { getFarmerById } from '../../api/client';
import { PENDING_LOCATION_LABEL } from '../../constants/regional';
import { OfflineCachedDataBanner } from '../../components/OfflineCachedDataBanner';
import type { AdminFarmersStackParamList } from '../../navigation/types';
import { loadWithReadCache, READ_CACHE_KEYS } from '../../services/offlineReadCache';
import { useReadCacheUserScope } from '../../hooks/useReadCacheUserScope';

type Props = NativeStackScreenProps<AdminFarmersStackParamList, 'FarmerDetail'>;

type FarmerDetail = {
  name: string;
  phone_number: string;
  gender: string;
  country: string;
  district: string;
  sub_county: string;
  parish?: string;
  village?: string;
  membership_group_name: string;
  membership_type: string;
  occupation?: string;
  size_of_land?: number;
  aggregation_center?: string;
  status: string;
  kb_farmer_id?: string;
  project_1?: string;
  project_2?: string;
  project_3?: string;
  projects?: Array<{
    project_name: string;
    status: string;
    completion_percentage: number;
    payment_amount: number;
    payment_status?: string;
    tasks_completed?: number;
    tasks_total?: number;
    progress_label?: string;
  }>;
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-2.5">
      <Text className="mb-0.5 text-xs text-[#757575]">{label}</Text>
      <Text className="text-[15px] font-medium text-[#333333]">{value}</Text>
    </View>
  );
}

function formatLocation(value: string): string {
  return value === PENDING_LOCATION_LABEL ? 'Location pending' : value;
}

export function AdminFarmerDetailScreen({ route }: Props) {
  const { farmerId } = route.params;
  const userScope = useReadCacheUserScope();
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheFetchedAt, setCacheFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await loadWithReadCache<{ farmer: FarmerDetail }>({
          cacheKey: READ_CACHE_KEYS.adminFarmerDetail(farmerId),
          userScope,
          fetchLive: () => getFarmerById(farmerId),
        });
        if (cancelled) return;
        setFarmer(result.data.farmer);
        setCacheFetchedAt(result.fromCache ? result.fetchedAt : null);
        setError(null);
      } catch {
        if (cancelled) return;
        setFarmer(null);
        setCacheFetchedAt(null);
        setError('Could not load farmer details');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmerId, userScope]);

  if (error && !farmer) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-base text-[#D32F2F]">{error}</Text>
      </View>
    );
  }

  if (!farmer) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  const projectNames = [farmer.project_1, farmer.project_2, farmer.project_3].filter(Boolean) as string[];

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-8">
      {cacheFetchedAt ? <OfflineCachedDataBanner fetchedAt={cacheFetchedAt} /> : null}
      <View className="mb-4 rounded-xl bg-[#1A4D3E] p-5">
        <Text className="text-2xl font-bold text-white">{farmer.name}</Text>
        <Text className="mt-1.5 text-base text-[#E8F5F0]">{farmer.phone_number}</Text>
        {farmer.kb_farmer_id ? (
          <Text className="mt-1 text-[13px] text-[#C8E6D9]">ID: {farmer.kb_farmer_id}</Text>
        ) : null}
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Profile</Text>
        <DetailRow label="Gender" value={farmer.gender} />
        <DetailRow label="Status" value={farmer.status} />
        <DetailRow label="Cooperative" value={farmer.membership_group_name} />
        <DetailRow label="Membership" value={farmer.membership_type} />
        <DetailRow label="Occupation" value={farmer.occupation} />
        {farmer.size_of_land ? (
          <DetailRow label="Land size" value={`${farmer.size_of_land} acres`} />
        ) : null}
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Location</Text>
        <DetailRow label="Country" value={farmer.country} />
        <DetailRow label="District" value={formatLocation(farmer.district)} />
        <DetailRow label="Sub-County" value={formatLocation(farmer.sub_county)} />
        <DetailRow label="Parish" value={farmer.parish} />
        <DetailRow label="Village" value={farmer.village} />
        <DetailRow label="Aggregation centre" value={farmer.aggregation_center} />
      </View>

      {(farmer.projects?.length ?? 0) > 0 || projectNames.length > 0 ? (
        <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
          <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Projects</Text>
          {farmer.projects?.map((p) => (
            <View key={p.project_name} className="mb-2.5">
              <Text className="text-[15px] font-semibold text-[#333333]">{p.project_name}</Text>
              <Text className="mt-0.5 text-[13px] text-[#757575]">
                {p.progress_label ?? `${p.completion_percentage}%`}
                {' · '}
                {p.status}
                {p.payment_status ? ` · ${p.payment_status}` : ''}
              </Text>
            </View>
          ))}
          {projectNames.map((name) => (
            <Text key={name} className="text-[15px] font-semibold text-[#333333]">
              {name}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
