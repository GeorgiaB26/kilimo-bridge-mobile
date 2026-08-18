import React, { useState } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import { LAND_UNITS, SPECIAL_NEEDS_OPTIONS } from '../../constants/registrationCategories';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Details'>;

function isValidGps(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const parts = trimmed.split(',').map((p) => p.trim());
  if (parts.length !== 2) return false;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function DetailsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    const land = parseFloat(formData.sizeOfLand ?? '');
    if (!formData.sizeOfLand?.trim() || !Number.isFinite(land) || land <= 0) {
      e.sizeOfLand = 'Size of land is required';
    }
    const family = parseInt(formData.familySize ?? '', 10);
    if (formData.familySize && (!Number.isFinite(family) || family < 1 || family > 20)) {
      e.familySize = 'Family size must be between 1 and 20';
    }
    const dependants = parseInt(formData.numberOfDependants ?? '', 10);
    if (
      formData.numberOfDependants &&
      (!Number.isFinite(dependants) || dependants < 0 || dependants > 30)
    ) {
      e.numberOfDependants = 'Dependants must be between 0 and 30';
    }
    if (formData.projectLocationGps && !isValidGps(formData.projectLocationGps)) {
      e.projectLocationGps = 'Use format: latitude, longitude (e.g. -3.28, 39.74)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Additional details" subtitle="Household, farm, and location info" />
      <FormField
        label="Ward"
        value={formData.ward ?? formData.parish ?? ''}
        onChangeText={(ward) => updateForm({ ward, parish: ward })}
        placeholder="Ward or area name"
      />
      <FormField
        label="Village"
        value={formData.village ?? ''}
        onChangeText={(village) => updateForm({ village })}
        placeholder="Village or estate"
      />
      <FormField
        label="Family size"
        value={formData.familySize ?? ''}
        onChangeText={(familySize) => updateForm({ familySize })}
        placeholder="5"
        keyboardType="number-pad"
        error={errors.familySize}
      />
      <FormField
        label="Number of dependants"
        value={formData.numberOfDependants ?? ''}
        onChangeText={(numberOfDependants) => updateForm({ numberOfDependants })}
        placeholder="3"
        keyboardType="number-pad"
        error={errors.numberOfDependants}
      />
      <FormField
        label="Profession (optional)"
        value={formData.profession ?? ''}
        onChangeText={(profession) => updateForm({ profession })}
        placeholder="Degrees, training, or N/A"
      />
      <PickerField
        label="Special needs"
        value={formData.specialNeeds ?? 'no'}
        options={[...SPECIAL_NEEDS_OPTIONS]}
        onSelect={(specialNeeds) => updateForm({ specialNeeds: specialNeeds as 'yes' | 'no' })}
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <FormField
            label="Size of land"
            value={formData.sizeOfLand ?? ''}
            onChangeText={(sizeOfLand) => updateForm({ sizeOfLand })}
            placeholder="2.5"
            keyboardType="decimal-pad"
            required
            error={errors.sizeOfLand}
          />
        </View>
        <View className="w-28">
          <PickerField
            label="Unit"
            value={formData.landUnit ?? 'Ha'}
            options={[...LAND_UNITS]}
            onSelect={(landUnit) => updateForm({ landUnit: landUnit as 'Ha' | 'Acres' })}
          />
        </View>
      </View>
      <FormField
        label="Farm input required"
        value={formData.farmInputRequired ?? ''}
        onChangeText={(farmInputRequired) => updateForm({ farmInputRequired })}
        placeholder="Seeds, fertilizer, tools…"
        multiline
      />
      <FormField
        label="Project location GPS (optional)"
        value={formData.projectLocationGps ?? ''}
        onChangeText={(projectLocationGps) => updateForm({ projectLocationGps })}
        placeholder="-3.2834, 39.7412"
        error={errors.projectLocationGps}
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
