import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { getFarmerById } from '../../api/client';
import { PENDING_LOCATION_LABEL } from '../../../../shared/src/constants';
import type { AdminFarmersStackParamList } from '../../navigation/types';

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
  }>;
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function formatLocation(value: string): string {
  return value === PENDING_LOCATION_LABEL ? 'Location pending' : value;
}

export function AdminFarmerDetailScreen({ route }: Props) {
  const { farmerId } = route.params;
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFarmerById(farmerId)
      .then((data) => setFarmer(data.farmer))
      .catch(() => setError('Could not load farmer details'));
  }, [farmerId]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!farmer) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const projectNames = [farmer.project_1, farmer.project_2, farmer.project_3].filter(Boolean) as string[];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.name}>{farmer.name}</Text>
        <Text style={styles.heroMeta}>{farmer.phone_number}</Text>
        {farmer.kb_farmer_id ? <Text style={styles.heroId}>ID: {farmer.kb_farmer_id}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Profile</Text>
        <DetailRow label="Gender" value={farmer.gender} />
        <DetailRow label="Status" value={farmer.status} />
        <DetailRow label="Cooperative" value={farmer.membership_group_name} />
        <DetailRow label="Membership" value={farmer.membership_type} />
        <DetailRow label="Occupation" value={farmer.occupation} />
        {farmer.size_of_land ? (
          <DetailRow label="Land size" value={`${farmer.size_of_land} acres`} />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Location</Text>
        <DetailRow label="Country" value={farmer.country} />
        <DetailRow label="District" value={formatLocation(farmer.district)} />
        <DetailRow label="Sub-County" value={formatLocation(farmer.sub_county)} />
        <DetailRow label="Parish" value={farmer.parish} />
        <DetailRow label="Village" value={farmer.village} />
        <DetailRow label="Aggregation centre" value={farmer.aggregation_center} />
      </View>

      {(farmer.projects?.length ?? 0) > 0 || projectNames.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.section}>Projects</Text>
          {farmer.projects?.map((p) => (
            <View key={p.project_name} style={styles.projectRow}>
              <Text style={styles.projectName}>{p.project_name}</Text>
              <Text style={styles.projectMeta}>
                {p.status} · {p.completion_percentage}% · {p.payment_status ?? 'No payment'}
              </Text>
            </View>
          ))}
          {projectNames.map((name) => (
            <Text key={name} style={styles.projectName}>
              {name}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: COLORS.alert, fontSize: 16, textAlign: 'center' },
  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  name: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  heroMeta: { fontSize: 16, color: '#E8F5F0', marginTop: 6 },
  heroId: { fontSize: 13, color: '#C8E6D9', marginTop: 4 },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  section: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { marginBottom: 10 },
  label: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
  value: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  projectRow: { marginBottom: 10 },
  projectName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  projectMeta: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
});
