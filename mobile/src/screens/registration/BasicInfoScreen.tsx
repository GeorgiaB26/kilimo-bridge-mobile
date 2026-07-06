import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'BasicInfo'>;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  return value;
}

export function BasicInfoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.name || formData.name.length < 2) e.name = 'Name must be at least 2 characters';
    if (!formData.gender) e.gender = 'Gender is required';
    if (!formData.phone) e.phone = 'Phone number is required';
    else if (!/^(\+254|0)[0-9]{9}$/.test(formData.phone.replace(/\s/g, '')) && !/^\+254[0-9]{9}$/.test(formatPhone(formData.phone))) {
      e.phone = 'Enter valid Kenya phone (+254... or 07...)';
    }
    if (!formData.idNumber || formData.idNumber.length < 5) e.idNumber = 'ID number is required (5+ chars)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    const phone = formatPhone(formData.phone);
    updateForm({ phone });
    if (validate()) navigation.navigate('Location');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Basic Info" subtitle="Tell us about yourself" />
      <FormField
        label="Full Name"
        value={formData.name}
        onChangeText={(name) => updateForm({ name })}
        placeholder="James Kariuki"
        required
        error={errors.name}
      />
      <PickerField
        label="Gender"
        value={formData.gender}
        options={GENDER_OPTIONS}
        onSelect={(gender) => updateForm({ gender: gender as 'M' | 'F' | 'Other' })}
        required
        error={errors.gender}
      />
      <FormField
        label="Phone Number"
        value={formData.phone}
        onChangeText={(phone) => updateForm({ phone })}
        placeholder="+254712345678"
        keyboardType="phone-pad"
        required
        error={errors.phone}
      />
      <FormField
        label="National ID"
        value={formData.idNumber}
        onChangeText={(idNumber) => updateForm({ idNumber })}
        placeholder="12345678"
        required
        error={errors.idNumber}
      />
      <Button title="Next" onPress={handleNext} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  button: { marginTop: 8 },
});
