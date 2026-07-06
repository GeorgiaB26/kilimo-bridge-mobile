import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS, GENDER_OPTIONS } from '../../constants';
import { registerFarmer } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Confirm'>;

const STEP_SCREENS: (keyof RegistrationStackParamList)[] = [
  'BasicInfo', 'Location', 'Membership', 'Details', 'Projects', 'Photo',
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

  const genderLabel = GENDER_OPTIONS.find((g) => g.value === formData.gender)?.label ?? formData.gender;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await registerFarmer(formData);
      Alert.alert(
        'Registration Successful',
        `Farmer registered with key: ${result.key}`,
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
      <View style={styles.card}>
        <SummaryRow label="Name" value={formData.name} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
        <SummaryRow label="Gender" value={genderLabel} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
        <SummaryRow label="Phone" value={formData.phone} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
        <SummaryRow label="ID Number" value={formData.idNumber} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
        <SummaryRow label="District" value={formData.district} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label="Sub-County" value={formData.subCounty} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
        <SummaryRow label="Membership Group" value={formData.membershipGroup} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
        {formData.occupation ? (
          <SummaryRow label="Occupation" value={formData.occupation} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
        ) : null}
        {formData.project1 ? (
          <SummaryRow label="Project 1" value={formData.project1} onEdit={() => navigation.navigate(STEP_SCREENS[4])} />
        ) : null}
        <SummaryRow label="Photo" value={formData.pictureUri ? 'Uploaded' : 'Initials avatar'} onEdit={() => navigation.navigate(STEP_SCREENS[5])} />
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
