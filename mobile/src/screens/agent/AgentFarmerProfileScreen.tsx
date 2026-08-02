import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getFarmerById, verifyFarmerField } from '../../api/client';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { formatFarmerStatus } from '../../utils/farmerStatus';
import { extractApiError } from '../../utils/feedback';
import type { AgentFarmersStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgentFarmersStackParamList, 'FarmerProfile'>;

type FarmerDetail = {
  farmer_id: string;
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
  size_of_land?: number | string;
  aggregation_center?: string;
  status: string;
  key?: string;
  registered_agent_name?: string;
  registered_agent_phone?: string;
  projects?: Array<{ project_name: string; status: string }>;
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

export function AgentFarmerProfileScreen({ route, navigation }: Props) {
  const { farmerId, name: routeName } = route.params;
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFarmerById(farmerId);
      setFarmer(data.farmer as FarmerDetail);
    } catch {
      setFarmer(null);
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusInfo = formatFarmerStatus(farmer?.status);
  const canVerify =
    farmer?.status === 'pending_review' || farmer?.status === 'pending_field_verification';

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await verifyFarmerField(farmerId, 'Verified in person at aggregation centre');
      Alert.alert('Verified', 'Farmer verified successfully.');
      await load();
    } catch (err) {
      Alert.alert('Error', extractApiError(err, 'Verification failed'));
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#1A4D3E" />
      </View>
    );
  }

  if (!farmer) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-[#D32F2F]">Could not load farmer profile.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-8">
      <View className="mb-4 rounded-xl bg-[#1A4D3E] p-5">
        <Text className="text-2xl font-bold text-white">{farmer.name || routeName}</Text>
        <Text className="mt-1.5 text-base text-[#E8F5F0]">{farmer.phone_number}</Text>
        <View className="mt-3">
          <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
        </View>
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Basic information</Text>
        <DetailRow label="Membership #" value={farmer.key} />
        <DetailRow label="Gender" value={farmer.gender} />
        <DetailRow label="Membership status" value={farmer.membership_type} />
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Location</Text>
        <DetailRow label="Country" value={farmer.country} />
        <DetailRow label="County" value={farmer.district} />
        <DetailRow label="Sub-County" value={farmer.sub_county} />
        <DetailRow label="Ward" value={farmer.parish} />
        <DetailRow label="Village" value={farmer.village} />
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Aggregation centre</Text>
        <DetailRow label="Centre name" value={farmer.aggregation_center ?? 'Not assigned'} />
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Membership</Text>
        <DetailRow label="Cooperative" value={farmer.membership_group_name} />
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Field agent</Text>
        <DetailRow label="Registered by" value={farmer.registered_agent_name ?? 'Not assigned'} />
        <DetailRow label="Agent phone" value={farmer.registered_agent_phone} />
        <DetailRow
          label="Verification"
          value={farmer.status === 'verified' ? 'Verified' : 'Not yet verified'}
        />
      </View>

      <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Land information</Text>
        <DetailRow label="Size of land" value={farmer.size_of_land ? `${farmer.size_of_land} acres` : undefined} />
        <DetailRow label="Occupation" value={farmer.occupation} />
      </View>

      {(farmer.projects?.length ?? 0) > 0 ? (
        <View className="mb-3 rounded-lg bg-[#F9F9F9] p-3.5">
          <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Projects</Text>
          {farmer.projects?.map((p) => (
            <Text key={p.project_name} className="mb-1 text-[15px] font-semibold text-[#333333]">
              {p.project_name} · {p.status}
            </Text>
          ))}
        </View>
      ) : null}

      {canVerify ? (
        <Button className="h-12 bg-[#1A4D3E]" disabled={verifying} onPress={handleVerify}>
          {verifying ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Verify Farmer</Text>}
        </Button>
      ) : null}
    </ScrollView>
  );
}
