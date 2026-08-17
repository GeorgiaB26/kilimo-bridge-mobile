import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { fetchReferenceData, fetchAggregationCentresByLocation } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import {
  MembershipCategoryFields,
  validateMembershipCategoryFields,
  membershipCategoryForSubmit,
} from '../../components/registration/MembershipCategoryFields';
import { CURRENCY_OPTIONS } from '../../constants/registrationCategories';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Membership'>;

type CentreOption = { id: string; name: string };

export function MembershipScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<string[]>([]);
  const [centres, setCentres] = useState<CentreOption[]>([]);
  const [loadingCentres, setLoadingCentres] = useState(false);
  const [centreWarning, setCentreWarning] = useState('');

  useEffect(() => {
    fetchReferenceData()
      .then((data) => setGroups(data.membershipGroups))
      .catch(() =>
        setGroups(['Gulu Women Economic Dev', 'Kiambu Cooperative', 'Nairobi Women Coop', 'Test Coop'])
      );
  }, []);

  useEffect(() => {
    if (formData.country) {
      const auto = getCurrencyForCountry(formData.country).code;
      if (!formData.currency || formData.currency === auto) {
        updateForm({ currency: auto });
      }
    }
  }, [formData.country, updateForm]);

  useEffect(() => {
    if (!formData.country || !formData.district) {
      setCentres([]);
      setCentreWarning('');
      return;
    }
    let cancelled = false;
    setLoadingCentres(true);
    setCentreWarning('');
    fetchAggregationCentresByLocation({
      country: formData.country,
      county: formData.district,
      subcounty: formData.subCounty,
    })
      .then((data) => {
        if (cancelled) return;
        const list = (data.centres ?? []).map((c) => ({ id: c.centre_id ?? c.id, name: c.name }));
        setCentres(list);
        if (list.length === 0) {
          setCentreWarning(
            'No aggregation centres are set up for this location yet. You can leave the centre blank or type a name and continue — admin can link a centre later.'
          );
          updateForm({ aggregationCentreId: '' });
        } else if (!formData.aggregationCenter || !list.some((c) => c.name === formData.aggregationCenter)) {
          updateForm({
            aggregationCenter: list[0].name,
            aggregationCentreId: list[0].id,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCentreWarning(
            'Could not load aggregation centres. You can leave the centre blank or type a name and continue.'
          );
          setCentres([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCentres(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.country, formData.district, formData.subCounty]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.membershipGroup) e.membershipGroup = 'Membership group is required';
    if (!formData.currency) e.currency = 'Currency preference is required';
    const catErrors = validateMembershipCategoryFields(formData);
    Object.assign(e, catErrors);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    const membershipCategory = membershipCategoryForSubmit(formData);
    updateForm({ membershipCategory: membershipCategory ?? formData.membershipCategory });
    if (formData.registrationCategory === 'corporate') {
      navigation.navigate('CorporateInfo');
    } else {
      navigation.navigate('Details');
    }
  };

  const centreNames = centres.map((c) => c.name);
  const isCorporate = formData.registrationCategory === 'corporate';

  return (
    <View className="flex-1">
      <ScreenHeader
        title="Membership"
        subtitle={isCorporate ? 'Organization category & cooperative' : 'Category & cooperative'}
      />

      <MembershipCategoryFields formData={formData} updateForm={updateForm} errors={errors} />

      <PickerField
        label="Membership Group / Cooperative"
        value={formData.membershipGroup}
        options={groups}
        onSelect={(membershipGroup) => updateForm({ membershipGroup })}
        required
        error={errors.membershipGroup}
      />
      {loadingCentres ? (
        <View className="mb-4 items-center py-3">
          <ActivityIndicator color="#1A4D3E" />
          <Text className="mt-2 text-sm text-[#757575]">Loading aggregation centres…</Text>
        </View>
      ) : centres.length > 0 ? (
        <PickerField
          label="Aggregation Centre"
          value={formData.aggregationCenter ?? ''}
          options={centreNames}
          onSelect={(name) => {
            const match = centres.find((c) => c.name === name);
            updateForm({
              aggregationCenter: name,
              aggregationCentreId: match?.id ?? '',
            });
          }}
          error={errors.aggregationCenter}
        />
      ) : (
        <View className="mb-4">
          {centreWarning || !formData.district ? (
            <View className="mb-3 rounded-lg border border-[#FF9800] bg-[#FFF8E1] p-3">
              <Text className="text-sm text-[#757575]">
                {centreWarning || 'Select location on the previous step to load centres.'}
              </Text>
            </View>
          ) : null}
          <FormField
            label="Aggregation Centre (optional)"
            value={formData.aggregationCenter ?? ''}
            onChangeText={(aggregationCenter) =>
              updateForm({ aggregationCenter, aggregationCentreId: '' })
            }
            placeholder="Leave blank or type a centre name"
          />
        </View>
      )}

      <PickerField
        label="Currency preference"
        value={formData.currency ?? ''}
        options={[...CURRENCY_OPTIONS]}
        onSelect={(currency) => updateForm({ currency })}
        required
        error={errors.currency}
      />
      <Text className="mb-3 text-xs text-[#757575]">
        Auto-set from country — change here if needed.
      </Text>

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
