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
import { findAggregationCentre } from '../../constants/regional';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Membership'>;

export function MembershipScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cooperatives, setCooperatives] = useState<string[]>([]);

  const suggestedCentre = findAggregationCentre(
    formData.country,
    formData.district,
    formData.subCounty
  );

  useEffect(() => {
    fetchReferenceData()
      .then((data) => setCooperatives(data.membershipGroups))
      .catch(() =>
        setCooperatives(['Gulu Women Economic Dev', 'Kiambu Cooperative', 'Nairobi Women Coop', 'LEOART'])
      );
  }, []);

  useEffect(() => {
    if (!formData.aggregationCenter && suggestedCentre) {
      updateForm({ aggregationCenter: suggestedCentre.name });
    }
  }, [suggestedCentre?.name, formData.district, formData.subCounty]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.membershipGroup) e.membershipGroup = 'Cooperative is required';
    if (!formData.membershipType) e.membershipType = 'Membership type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onNext = () => {
    if (!validate()) return;
    navigation.navigate('Details');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Cooperative"
        subtitle="Cooperative affiliation (verified by cooperative records)"
      />
      <Text style={styles.note}>
        Membership type and role are assigned by your program manager after approval.
      </Text>
      <PickerField
        label="Cooperative"
        value={formData.membershipGroup}
        options={cooperatives.map((g) => ({ label: g, value: g }))}
        onSelect={(membershipGroup) => updateForm({ membershipGroup })}
        placeholder="Select cooperative"
        error={errors.membershipGroup}
      />
      <PickerField
        label="Membership Type"
        value={formData.membershipType ?? 'Active'}
        options={MEMBERSHIP_TYPES.map((t) => ({ label: t, value: t }))}
        onSelect={(membershipType) => updateForm({ membershipType })}
        error={errors.membershipType}
      />
      <FormField
        label="Role (assigned by PM)"
        value={formData.farmerRole ?? 'farmer'}
        onChangeText={() => {}}
        editable={false}
        placeholder="farmer"
      />
      <Text style={styles.readOnly}>Read-only — PM assigns role after approval</Text>
      <FormField
        label="Aggregation Centre"
        value={formData.aggregationCenter ?? suggestedCentre?.name ?? ''}
        onChangeText={(aggregationCenter) => updateForm({ aggregationCenter })}
        placeholder="Auto-suggested from location"
      />
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={onNext} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  note: { fontSize: 13, color: COLORS.muted, marginBottom: 12, lineHeight: 18 },
  readOnly: { fontSize: 11, color: COLORS.muted, marginBottom: 12, marginTop: -8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
