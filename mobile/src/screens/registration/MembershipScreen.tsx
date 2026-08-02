import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MEMBERSHIP_TYPES, CURRENCY_OPTIONS } from '../../constants';
import { fetchReferenceData } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import { findAggregationCentre } from '../../constants/regional';
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
    if (!formData.currency && formData.country) {
      updateForm({ currency: getCurrencyForCountry(formData.country).code });
    }
  }, [formData.country, formData.currency, updateForm]);

  useEffect(() => {
    if (!formData.aggregationCenter && suggestedCentre) {
      updateForm({ aggregationCenter: suggestedCentre.name });
    }
  }, [suggestedCentre?.name, formData.district, formData.subCounty]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.membershipGroup) e.membershipGroup = 'Membership group is required';
    if (!formData.membershipType) e.membershipType = 'Membership type is required';
    if (!formData.currency) e.currency = 'Currency preference is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View className="flex-1">
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
        <View className="mb-4 rounded-lg border-l-4 border-[#1A4D3E] bg-[#E8F5F0] p-3.5">
          <Text className="mb-1 text-xs text-[#757575]">Assigned aggregation centre</Text>
          <Text className="text-base font-semibold text-[#1A4D3E]">{formData.aggregationCenter || suggestedCentre.name}</Text>
          <Text className="mt-1 text-[11px] text-[#757575]">Auto-assigned based on your location</Text>
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
        required
        error={errors.membershipType}
      />
      <PickerField
        label="Currency Preference"
        value={formData.currency ?? ''}
        options={CURRENCY_OPTIONS}
        onSelect={(currency) => updateForm({ currency })}
        required
        error={errors.currency}
      />
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button
          className="h-12 flex-1 bg-[#1A4D3E]"
          onPress={() => validate() && navigation.navigate('Details')}
        >
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
