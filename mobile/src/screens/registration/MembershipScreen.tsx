import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MEMBERSHIP_TYPES } from '../../constants';
import { fetchReferenceData, fetchAggregationCentresByLocation } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCurrencyForCountry } from '../../utils/currencyMap';
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
    if (!formData.currency && formData.country) {
      updateForm({ currency: getCurrencyForCountry(formData.country).code });
    }
  }, [formData.country, formData.currency, updateForm]);

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
          // Keep any manual name the agent already typed; clear only a stale picker id
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
    if (!formData.membershipType) e.membershipType = 'Membership type is required';
    if (!formData.currency) e.currency = 'Currency preference is required';
    // Aggregation centre is optional — soft warning only when none match the location
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const centreNames = centres.map((c) => c.name);

  return (
    <View>
      <ScreenHeader title="Membership" subtitle="Cooperative and aggregation centre" />
      <PickerField
        label="Membership Group"
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
        label="Membership Type"
        value={formData.membershipType ?? 'Active'}
        options={MEMBERSHIP_TYPES}
        onSelect={(membershipType) => updateForm({ membershipType })}
        required
        error={errors.membershipType}
      />
      <View className="mb-4">
        <Text className="mb-1 text-sm font-semibold text-[#333333]">Currency preference</Text>
        <View className="rounded-lg border border-[#E0E0E0] bg-[#E0E0E0] px-3 py-3 opacity-90">
          <Text className="text-[15px] text-[#757575]">
            {formData.currency ?? (formData.country ? getCurrencyForCountry(formData.country).code : '—')}
          </Text>
        </View>
        <Text className="mt-1 text-xs text-[#757575]">
          Currency automatically set based on selected country
        </Text>
        {errors.currency ? <Text className="mt-1 text-xs text-[#D32F2F]">{errors.currency}</Text> : null}
      </View>
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
