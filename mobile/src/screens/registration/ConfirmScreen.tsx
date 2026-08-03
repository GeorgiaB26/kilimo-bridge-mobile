import React, { useMemo, useState } from 'react';
import { View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { RegistrationSuccessModal } from '../../components/registration/RegistrationSuccessModal';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, generateFarmerId } from '../../constants/regional';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import { submitFarmerRegistration } from '../../services/submitFarmerRegistration';
import { extractApiError } from '../../utils/feedback';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Confirm'>;

type FarmerRegScreen =
  | 'Country'
  | 'BasicInfo'
  | 'Location'
  | 'Membership'
  | 'Details'
  | 'Projects'
  | 'Photo';

const STEP_SCREENS: FarmerRegScreen[] = [
  'Country', 'BasicInfo', 'Location', 'Membership', 'Details', 'Projects', 'Photo',
];

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <View className="flex-row items-center justify-between border-b border-[#E0E0E0] py-2.5">
      <View className="flex-1">
        <Text className="mb-0.5 text-xs text-[#757575]">{label}</Text>
        <Text className="text-base font-medium text-[#333333]">{value || '—'}</Text>
      </View>
      <Text className="ml-2 text-sm font-semibold text-[#1976D2]" onPress={onEdit}>Edit</Text>
    </View>
  );
}

export function ConfirmScreen({ navigation }: Props) {
  const { formData, resetForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{
    farmerId?: string;
    kbFarmerId?: string;
    offline?: boolean;
  } | null>(null);

  const countryConfig = getCountryConfig(formData.country);
  const currencyInfo = formData.currency
    ? { code: formData.currency, name: formData.currency }
    : getCurrencyForCountry(formData.country);
  const labels = countryConfig?.levelLabels ?? ['Region', 'Sub-Region', 'Area', 'Village'];
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === formData.gender)?.label ?? formData.gender;

  const kbFarmerId = useMemo(
    () =>
      generateFarmerId(new Date(), [formData.district, formData.subCounty, formData.parish ?? ''], formData.phone),
    [formData.district, formData.subCounty, formData.parish, formData.phone]
  );

  const goToFarmersList = () => {
    setSuccess(null);
    resetForm();
    navigation.getParent()?.goBack();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = await submitFarmerRegistration(formData, formData.pictureBase64);
      if (result.mode === 'offline') {
        setSuccess({ offline: true, kbFarmerId });
        return;
      }
      setSuccess({
        farmerId: result.farmerId,
        kbFarmerId: result.kbFarmerId ?? kbFarmerId,
      });
    } catch (err: unknown) {
      Alert.alert('Registration Failed', extractApiError(err, 'Please check your details and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const viewProfile = () => {
    const id = success?.farmerId;
    if (!id) return;
    const farmerName = formData.name;
    setSuccess(null);
    resetForm();
    const parent = navigation.getParent();
    parent?.goBack();
    setTimeout(() => {
      (parent as { navigate?: (name: string, params: unknown) => void })?.navigate?.('FarmerProfile', {
        farmerId: id,
        name: farmerName,
      });
    }, 100);
  };

  return (
    <>
      <ScrollView className="flex-1">
        <ScreenHeader title="Confirm" subtitle="Review your information" />
        <View className="mb-4 items-center rounded-[10px] bg-[#1A4D3E] p-4">
          <Text className="mb-1 text-[13px] text-white/85">Your Kilimo Bridge ID</Text>
          <Text className="text-[22px] font-bold tracking-wide text-[#D4AF6A]">{kbFarmerId}</Text>
        </View>
        <View className="mb-4 rounded-lg bg-[#F9F9F9] p-4">
          <SummaryRow label="Country" value={formData.country} onEdit={() => navigation.navigate(STEP_SCREENS[0])} />
          <SummaryRow label="Currency" value={`${currencyInfo.code}`} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
          <SummaryRow label="Name" value={formData.name} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
          <SummaryRow label="Gender" value={genderLabel} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
          <SummaryRow label="Phone" value={formData.phone} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
          <SummaryRow label="ID Number" value={formData.idNumber} onEdit={() => navigation.navigate(STEP_SCREENS[1])} />
          <SummaryRow label={labels[0]} value={formData.district} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
          <SummaryRow label={labels[1]} value={formData.subCounty} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
          {formData.parish ? (
            <SummaryRow label={labels[2]} value={formData.parish} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
          ) : null}
          {formData.village ? (
            <SummaryRow label={labels[3]} value={formData.village} onEdit={() => navigation.navigate(STEP_SCREENS[2])} />
          ) : null}
          <SummaryRow label="Membership Group" value={formData.membershipGroup} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
          <SummaryRow label="Aggregation Centre" value={formData.aggregationCenter ?? ''} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
          <SummaryRow label="Membership Type" value={formData.membershipType ?? 'Active'} onEdit={() => navigation.navigate(STEP_SCREENS[3])} />
          {formData.profession ? (
            <SummaryRow label="Profession" value={formData.profession} onEdit={() => navigation.navigate(STEP_SCREENS[4])} />
          ) : null}
          {formData.occupation ? (
            <SummaryRow label="Occupation" value={formData.occupation} onEdit={() => navigation.navigate(STEP_SCREENS[4])} />
          ) : null}
          {formData.sizeOfLand ? (
            <SummaryRow label="Land (acres)" value={formData.sizeOfLand} onEdit={() => navigation.navigate(STEP_SCREENS[4])} />
          ) : null}
          {formData.project1 ? (
            <SummaryRow label="Project 1" value={formData.project1} onEdit={() => navigation.navigate(STEP_SCREENS[5])} />
          ) : null}
          <SummaryRow label="Photo" value={formData.pictureUri ? 'Uploaded' : 'Missing'} onEdit={() => navigation.navigate(STEP_SCREENS[6])} />
        </View>
        <View className="mb-8 flex-row gap-3">
          <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
            <Text>Back</Text>
          </Button>
          <Button className="h-12 flex-1 bg-[#1A4D3E]" disabled={loading} onPress={handleSubmit}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Register Farmer</Text>}
          </Button>
        </View>
      </ScrollView>

      <RegistrationSuccessModal
        visible={!!success}
        farmerName={formData.name}
        farmerPhone={formData.phone}
        statusLabel="pending_review"
        farmerId={success?.farmerId}
        kbFarmerId={success?.kbFarmerId ?? kbFarmerId}
        offline={success?.offline}
        onViewProfile={viewProfile}
        onRegisterAnother={() => {
          setSuccess(null);
          resetForm();
          navigation.navigate('Country');
        }}
        onClose={goToFarmersList}
      />
    </>
  );
}
