import React, { useState, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import {
  getCountryConfig,
  getCountryCode,
  getLevel1Options,
  getLevel2Options,
  getLevel3Options,
} from '../../constants/regional';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Location'>;

export function LocationScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const countryConfig = getCountryConfig(formData.country);
  const countryCode = getCountryCode(formData.country);
  const labels = countryConfig?.levelLabels ?? ['Region', 'Sub-Region', 'Area', 'Village'];

  const level1Options = useMemo(
    () => (countryCode ? getLevel1Options(countryCode) : []),
    [countryCode]
  );
  const level2Options = useMemo(
    () => (countryCode && formData.district ? getLevel2Options(countryCode, formData.district) : []),
    [countryCode, formData.district]
  );
  const level3Options = useMemo(
    () =>
      countryCode && formData.district && formData.subCounty
        ? getLevel3Options(countryCode, formData.district, formData.subCounty)
        : [],
    [countryCode, formData.district, formData.subCounty]
  );

  useEffect(() => {
    if (formData.district && formData.subCounty && !level2Options.includes(formData.subCounty)) {
      updateForm({ subCounty: '', parish: '' });
    }
  }, [formData.district, level2Options]);

  useEffect(() => {
    if (formData.subCounty && formData.parish && level3Options.length > 0 && !level3Options.includes(formData.parish)) {
      updateForm({ parish: '' });
    }
  }, [formData.subCounty, level3Options]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.district) e.district = `${labels[0]} is required`;
    if (!formData.subCounty) e.subCounty = `${labels[1]} is required`;
    if (level3Options.length > 0 && !formData.parish) e.parish = `${labels[2]} is required`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View>
      <ScreenHeader title="Location" subtitle={`Where are you based in ${formData.country}?`} />
      <PickerField
        label={labels[0]}
        value={formData.district}
        options={level1Options}
        onSelect={(district) => updateForm({ district, subCounty: '', parish: '' })}
        required
        error={errors.district}
        searchable
      />
      <PickerField
        label={labels[1]}
        value={formData.subCounty}
        options={level2Options}
        onSelect={(subCounty) => updateForm({ subCounty, parish: '' })}
        required
        error={errors.subCounty}
        placeholder={formData.district ? `Select ${labels[1].toLowerCase()}` : `Select ${labels[0].toLowerCase()} first`}
        searchable
      />
      {level3Options.length > 0 ? (
        <PickerField
          label={labels[2]}
          value={formData.parish ?? ''}
          options={level3Options}
          onSelect={(parish) => updateForm({ parish, ward: parish })}
          required
          error={errors.parish}
          placeholder={formData.subCounty ? `Select ${labels[2].toLowerCase()}` : `Select ${labels[1].toLowerCase()} first`}
          searchable
        />
      ) : (
        <FormField
          label={labels[2]}
          value={formData.parish ?? ''}
          onChangeText={(parish) => updateForm({ parish, ward: parish })}
          placeholder="Optional"
        />
      )}
      <FormField
        label={labels[3]}
        value={formData.village ?? ''}
        onChangeText={(village) => updateForm({ village })}
        placeholder="Optional"
      />
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button
          className="h-12 flex-1 bg-[#1A4D3E]"
          onPress={() => validate() && navigation.navigate('Membership')}
        >
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
