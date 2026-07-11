import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS, GENDER_OPTIONS } from '../../constants';
import { registerFarmer } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, generateFarmerId } from '../../constants/regional';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Confirm'>;

const STEP_SCREENS: (keyof RegistrationStackParamList)[] = [
  'Country', 'BasicInfo', 'Location', 'Membership', 'Details', 'Projects', 'Photo',
];

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value || '—'}</Text>
      </View>
      <Text style={styles.editBtn} onPress={onEdit}>Edit</Text>
    </View>
  );
}

export function ConfirmScreen({ navigation }: Props) {
  const { formData, resetForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);

  const countryConfig = getCountryConfig(formData.country);
  const labels = countryConfig?.levelLabels ?? ['Region', 'Sub-Region', 'Area', 'Village'];
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === formData.gender)?.label ?? formData.gender;

  const kbFarmerId = useMemo(
    () =>
      generateFarmerId(new Date(), [formData.district, formData.subCounty, formData.parish ?? ''], formData.phone),
    [formData.district, formData.subCounty, formData.parish, formData.phone]
  );

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await registerFarmer(formData);
      Alert.alert(
        'Registration Successful',
        `Farmer ID: ${result.kbFarmerId ?? kbFarmerId}\nKey: ${result.key}`,
        [{ text: 'OK', onPress: () => { resetForm(); } }]
      );
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { errors?: { error: string }[] } } }).response?.data?.errors?.[0]?.error
        : 'Registration failed. Please try again.';
      Alert.alert('Registration Failed', message ?? 'Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <ScreenHeader title="Confirm" subtitle="Review your information" />
      <View style={styles.idCard}>
        <Text style={styles.idLabel}>Your Kilimo Bridge ID</Text>
        <Text style={styles.idValue}>{kbFarmerId}</Text>
      </View>
      <View style={styles.card}>
        <SummaryRow label="Country" value={formData.country} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
        <SummaryRow label="Name" value={formData.name} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label="Gender" value={genderLabel} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label="Phone" value={formData.phone} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label="ID Number" value={formData.idNumber} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label={labels[0]} value={formData.district} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
        <SummaryRow label={labels[1]} value={formData.subCounty} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
        {formData.parish ? (
          <SummaryRow label={labels[2]} value={formData.parish} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
        ) : null}
        {formData.village ? (
          <SummaryRow label={labels[3]} value={formData.village} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
        ) : null}
        <SummaryRow label="Membership Group" value={formData.membershipGroup} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
        {formData.aggregationCenter ? (
          <SummaryRow label="Aggregation Centre" value={formData.aggregationCenter} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
        ) : null}
        {formData.occupation ? (
          <SummaryRow label="Occupation" value={formData.occupation} onEdit={() => navigation.navigate(STEP_SCREENS[4])} />
        ) : null}
        {formData.project1 ? (
          <SummaryRow label="Project 1" value={formData.project1} onEdit={() => navigation.navigate(STEP_SCREENS[5])} />
        ) : null}
        <SummaryRow label="Photo" value={formData.pictureUri ? 'Uploaded' : 'Initials avatar'} onEdit={() => navigation.navigate(STEP_SCREENS[6])} />
      </View>
      <View style={styles.actions}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Submit Registration" onPress={handleSubmit} loading={loading} style={styles.half} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  idCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  idLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  idValue: { fontSize: 22, fontWeight: '700', color: COLORS.accent, letterSpacing: 1 },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 2 },
  rowValue: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  editBtn: { color: COLORS.info, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  half: { flex: 1 },
});
