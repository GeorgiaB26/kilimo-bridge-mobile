import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, normalizePhoneForCountry } from '../../constants/regional';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'BasicInfo'>;

export function BasicInfoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const countryConfig = getCountryConfig(formData.country);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.name || formData.name.length < 2) e.name = 'Name must be at least 2 characters';
    if (!formData.gender) e.gender = 'Gender is required';
    if (!formData.phone) {
      e.phone = 'Phone number is required';
    } else if (!normalizePhoneForCountry(formData.phone, formData.country)) {
      e.phone = countryConfig?.phoneError ?? 'Invalid phone number';
    }
    if (!formData.idNumber || formData.idNumber.length < 5) e.idNumber = 'ID number is required (5+ chars)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    const phone = normalizePhoneForCountry(formData.phone, formData.country) ?? formData.phone;
    updateForm({ phone });
    if (validate()) navigation.navigate('Location');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Basic Info" subtitle={`Registering in ${formData.country}`} />
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
        placeholder={countryConfig?.phoneExample ?? '+254712345678'}
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
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={handleNext} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
