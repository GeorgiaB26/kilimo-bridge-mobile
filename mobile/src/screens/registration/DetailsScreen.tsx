import React, { useState } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Details'>;

export function DetailsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.occupation?.trim() || formData.occupation.trim().length < 2) {
      e.occupation = 'Occupation is required (the job you do to earn money)';
    }
    const land = parseFloat(formData.sizeOfLand ?? '');
    if (!formData.sizeOfLand?.trim() || !Number.isFinite(land) || land <= 0) {
      e.sizeOfLand = 'Size of land in acres is required';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Farmer details" subtitle="Occupation and land size" />
      <FormField
        label="Profession (optional)"
        value={formData.profession ?? ''}
        onChangeText={(profession) => updateForm({ profession })}
        placeholder="Degrees, training, deep knowledge — or N/A"
      />
      <Text className="mb-3 text-xs text-[#757575]">
        Please tell us if you have deep knowledge, degrees, or anything you have studied, or enter N/A if none.
      </Text>
      <FormField
        label="Occupation"
        value={formData.occupation ?? ''}
        onChangeText={(occupation) => updateForm({ occupation })}
        placeholder="The job you do to earn money"
        required
        error={errors.occupation}
      />
      <FormField
        label="Size of Land (acres)"
        value={formData.sizeOfLand ?? ''}
        onChangeText={(sizeOfLand) => updateForm({ sizeOfLand })}
        placeholder="2.5"
        keyboardType="decimal-pad"
        required
        error={errors.sizeOfLand}
      />
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button
          className="h-12 flex-1 bg-[#1A4D3E]"
          onPress={() => validate() && navigation.navigate('Projects')}
        >
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
