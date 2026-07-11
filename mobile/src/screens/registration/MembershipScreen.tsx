import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MEMBERSHIP_TYPES, COLORS } from '../../constants';
import { fetchReferenceData } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import { findAggregationCentre } from '../../../../shared/src/locations/aggregationCentres';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Membership'>;

export function MembershipScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<string[]>([]);

  const suggestedCentre = findAggregationCentre(
    formData.country,
    formData.district,
    formData.subCounty
  );

  useEffect(() => {
    fetchReferenceData()
      .then((data) => setGroups(data.membershipGroups))
      .catch(() =>
        setGroups(['Gulu Women Economic Dev', 'Kiambu Cooperative', 'Nairobi Women Coop', 'Test Coop'])
      );
  }, []);

  useEffect(() => {
    if (!formData.aggregationCenter && suggestedCentre) {
      updateForm({ aggregationCenter: suggestedCentre.name });
    }
  }, [suggestedCentre?.name, formData.district, formData.subCounty]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.membershipGroup) e.membershipGroup = 'Membership group is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Membership" subtitle="Your cooperative details" />
      <PickerField
        label="Membership Group"
        value={formData.membershipGroup}
        options={groups}
        onSelect={(membershipGroup) => updateForm({ membershipGroup })}
        required
        error={errors.membershipGroup}
      />
      {suggestedCentre ? (
        <View style={styles.suggestedCard}>
          <Text style={styles.suggestedLabel}>Assigned aggregation centre</Text>
          <Text style={styles.suggestedValue}>{formData.aggregationCenter || suggestedCentre.name}</Text>
          <Text style={styles.suggestedHint}>Auto-assigned based on your location</Text>
        </View>
      ) : (
        <FormField
          label="Aggregation Center"
          value={formData.aggregationCenter ?? ''}
          onChangeText={(aggregationCenter) => updateForm({ aggregationCenter })}
          placeholder="Optional"
        />
      )}
      <PickerField
        label="Membership Type"
        value={formData.membershipType ?? 'Active'}
        options={MEMBERSHIP_TYPES}
        onSelect={(membershipType) => updateForm({ membershipType })}
      />
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button
          title="Next"
          onPress={() => validate() && navigation.navigate('Details')}
          style={styles.half}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  suggestedCard: {
    backgroundColor: '#E8F5F0',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  suggestedLabel: { fontSize: 12, color: COLORS.muted, marginBottom: 4 },
  suggestedValue: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  suggestedHint: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
