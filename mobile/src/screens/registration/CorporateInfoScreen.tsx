import React, { useState } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'CorporateInfo'>;

export function CorporateInfoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.organizationName?.trim() || formData.organizationName.trim().length < 2) {
      e.organizationName = 'Organization name is required';
    }
    if (!formData.organizationRegistrationNumber?.trim()) {
      e.organizationRegistrationNumber = 'Registration number is required';
    }
    if (!formData.taxPin?.trim()) {
      e.taxPin = 'Tax PIN is required';
    }
    if (!formData.contactPersonName?.trim()) {
      e.contactPersonName = 'Contact person name is required';
    }
    if (!formData.contactPersonRole?.trim()) {
      e.contactPersonRole = 'Contact person role is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    updateForm({
      name: formData.organizationName?.trim() || formData.name,
    });
    navigation.navigate('Photo');
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Organization" subtitle="Corporate member details" />
      <FormField
        label="Organization name"
        value={formData.organizationName ?? ''}
        onChangeText={(organizationName) => updateForm({ organizationName })}
        required
        error={errors.organizationName}
      />
      <FormField
        label="Registration number"
        value={formData.organizationRegistrationNumber ?? ''}
        onChangeText={(organizationRegistrationNumber) =>
          updateForm({ organizationRegistrationNumber })
        }
        required
        error={errors.organizationRegistrationNumber}
      />
      <FormField
        label="Tax PIN"
        value={formData.taxPin ?? ''}
        onChangeText={(taxPin) => updateForm({ taxPin })}
        required
        error={errors.taxPin}
      />
      <FormField
        label="Contact person name"
        value={formData.contactPersonName ?? ''}
        onChangeText={(contactPersonName) => updateForm({ contactPersonName })}
        required
        error={errors.contactPersonName}
      />
      <FormField
        label="Contact person role"
        value={formData.contactPersonRole ?? ''}
        onChangeText={(contactPersonRole) => updateForm({ contactPersonRole })}
        placeholder="e.g. Director, Manager"
        required
        error={errors.contactPersonRole}
      />
      <FormField
        label="Contact email (optional)"
        value={formData.contactPersonEmail ?? ''}
        onChangeText={(contactPersonEmail) => updateForm({ contactPersonEmail })}
        placeholder="contact@organization.org"
        keyboardType="email-address"
        autoCapitalize="none"
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
