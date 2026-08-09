import React, { useState } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, normalizePhoneForCountry } from '../../constants/regional';
import { validateFarmerName } from '../../../shared/src/validation';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'BasicInfo'>;

export function BasicInfoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const countryConfig = getCountryConfig(formData.country);

  const validate = (values: {
    name: string;
    gender: string;
    phone: string;
    idNumber: string;
  }) => {
    const e: Record<string, string> = {};
    const nameError = validateFarmerName(values.name);
    if (nameError) e.name = nameError;
    if (!values.gender) e.gender = 'Gender is required';
    if (!values.phone.trim()) {
      e.phone = 'Phone number is required';
    } else if (!normalizePhoneForCountry(values.phone, formData.country)) {
      e.phone = countryConfig?.phoneError ?? 'Invalid phone number';
    }
    const id = values.idNumber.trim();
    if (!id || id.length < 5) e.idNumber = 'ID number is required (5+ chars)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    const name = formData.name.trim();
    const phone =
      normalizePhoneForCountry(formData.phone, formData.country) ?? formData.phone.trim();
    const idNumber = formData.idNumber.trim();
    const gender = formData.gender;

    if (
      !validate({
        name,
        gender,
        phone: formData.phone,
        idNumber,
      })
    ) {
      return;
    }

    updateForm({ name, phone, idNumber });
    navigation.navigate('Location');
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Basic Info" subtitle={`Registering in ${formData.country}`} />
      <FormField
        label="Full Name"
        value={formData.name}
        onChangeText={(name) => {
          updateForm({ name });
          if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
        }}
        placeholder="James Kariuki"
        required
        error={errors.name}
        autoCapitalize="words"
      />
      <PickerField
        label="Gender"
        value={formData.gender}
        options={GENDER_OPTIONS}
        onSelect={(gender) => {
          updateForm({ gender: gender as 'M' | 'F' | 'Other' });
          if (errors.gender) setErrors((prev) => ({ ...prev, gender: '' }));
        }}
        required
        error={errors.gender}
      />
      <FormField
        label="Phone Number"
        value={formData.phone}
        onChangeText={(phone) => {
          updateForm({ phone });
          if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
        }}
        placeholder={countryConfig?.phoneExample ?? '+254712345678'}
        keyboardType="phone-pad"
        required
        error={errors.phone}
      />
      <FormField
        label="National ID"
        value={formData.idNumber}
        onChangeText={(idNumber) => {
          updateForm({ idNumber });
          if (errors.idNumber) setErrors((prev) => ({ ...prev, idNumber: '' }));
        }}
        placeholder="12345678"
        required
        error={errors.idNumber}
      />
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button className="h-12 flex-1 bg-[#1A4D3E]" onPress={handleNext}>
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
