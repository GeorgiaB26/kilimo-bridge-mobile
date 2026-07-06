import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MEMBERSHIP_TYPES } from '../../constants';
import { fetchReferenceData } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Membership'>;

export function MembershipScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    fetchReferenceData()
      .then((data) => setGroups(data.membershipGroups))
      .catch(() =>
        setGroups(['Gulu Women Economic Dev', 'Kiambu Cooperative', 'Nairobi Women Coop', 'Test Coop'])
      );
  }, []);

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
      <FormField
        label="Aggregation Center"
        value={formData.aggregationCenter ?? ''}
        onChangeText={(aggregationCenter) => updateForm({ aggregationCenter })}
        placeholder="Optional"
      />
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
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
