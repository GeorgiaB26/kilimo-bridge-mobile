import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { RegistrationSuccessModal } from '../../components/registration/RegistrationSuccessModal';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, generateFarmerId, normalizePhoneForCountry } from '../../constants/regional';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import { submitFarmerRegistration } from '../../services/submitFarmerRegistration';
import { extractApiError, showMessage } from '../../utils/feedback';
import { validateFarmerName } from '../../../shared/src/validation';
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

function parentHasRoute(
  parent: { getState?: () => { routeNames?: string[] } } | undefined,
  routeName: string
): boolean {
  return Boolean(parent?.getState?.()?.routeNames?.includes(routeName));
}

function findStackWithRoute(
  navigation: { getParent: () => unknown },
  routeName: string
): { dispatch: (action: unknown) => void; goBack: () => void } | undefined {
  let parent = navigation.getParent() as
    | {
        getParent?: () => unknown;
        getState?: () => { routeNames?: string[] };
        dispatch: (action: unknown) => void;
        goBack: () => void;
      }
    | undefined;
  while (parent) {
    if (parentHasRoute(parent, routeName)) return parent;
    parent = parent.getParent?.() as typeof parent;
  }
  return undefined;
}

export function ConfirmScreen({ navigation }: Props) {
  const { formData, resetForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
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
    const farmersStack = findStackWithRoute(navigation, 'FarmerList');
    if (farmersStack) {
      farmersStack.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'FarmerList' }],
        })
      );
      return;
    }
    navigation.getParent()?.goBack();
  };

  const registerAnother = () => {
    setSuccess(null);
    resetForm();
    const farmersStack = findStackWithRoute(navigation, 'RegisterPicker');
    if (farmersStack) {
      farmersStack.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [{ name: 'FarmerList' }, { name: 'RegisterPicker' }],
        })
      );
      return;
    }
    // Public registration flow — restart at country.
    navigation.navigate('Country');
  };

  const viewProfile = () => {
    const id = success?.farmerId;
    if (!id) return;
    const farmerName = formData.name;
    setSuccess(null);
    resetForm();
    const farmersStack = findStackWithRoute(navigation, 'FarmerProfile');
    if (farmersStack) {
      farmersStack.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'FarmerList' },
            { name: 'FarmerProfile', params: { farmerId: id, name: farmerName } },
          ],
        })
      );
      return;
    }
    navigation.getParent()?.goBack();
  };

  const handleSubmit = async () => {
    const nameError = validateFarmerName(formData.name);
    if (nameError) {
      setSubmitError(nameError);
      showMessage('Fix name', nameError);
      navigation.navigate('BasicInfo');
      return;
    }
    if (!formData.gender) {
      setSubmitError('Gender is required');
      showMessage('Missing information', 'Gender is required');
      navigation.navigate('BasicInfo');
      return;
    }
    if (!formData.phone?.trim() || !normalizePhoneForCountry(formData.phone, formData.country)) {
      const msg = 'A valid phone number is required';
      setSubmitError(msg);
      showMessage('Fix phone', msg);
      navigation.navigate('BasicInfo');
      return;
    }
    if (!formData.idNumber?.trim() || formData.idNumber.trim().length < 5) {
      const msg = 'ID number is required (5+ chars)';
      setSubmitError(msg);
      showMessage('Fix ID number', msg);
      navigation.navigate('BasicInfo');
      return;
    }
    if (!formData.district || !formData.subCounty) {
      const msg = 'Location details are incomplete';
      setSubmitError(msg);
      showMessage('Fix location', msg);
      navigation.navigate('Location');
      return;
    }
    if (!formData.membershipGroup || !formData.membershipType) {
      const msg = 'Membership details are incomplete';
      setSubmitError(msg);
      showMessage('Fix membership', msg);
      navigation.navigate('Membership');
      return;
    }
    if (!formData.occupation?.trim() || !formData.sizeOfLand?.trim()) {
      const msg = 'Occupation and land size are required';
      setSubmitError(msg);
      showMessage('Fix farmer details', msg);
      navigation.navigate('Details');
      return;
    }
    if (!formData.pictureBase64 && !formData.pictureUri) {
      const msg = 'A verification photo is required. Go back to the Photo step and add one.';
      setSubmitError(msg);
      showMessage('Photo required', msg);
      navigation.navigate('Photo');
      return;
    }

    setLoading(true);
    setSubmitError('');
    try {
      const result = await submitFarmerRegistration(formData, formData.pictureBase64);
      if (result.mode === 'offline') {
        setSuccess({ offline: true, kbFarmerId });
        showMessage(
          'Saved offline',
          'Registration is queued on this device and will sync when connection is available.'
        );
        return;
      }
      setSuccess({
        farmerId: result.farmerId,
        kbFarmerId: result.kbFarmerId ?? kbFarmerId,
      });
      showMessage('Farmer registered', `${formData.name} was registered successfully.`);
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Please check your details and try again.');
      setSubmitError(msg);
      showMessage('Registration failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <View className="flex-1 px-4 pb-4">
        <ScreenHeader title="Confirm" subtitle="Review your information" />

        <View className="mb-4 flex-row gap-3">
          <Pressable
            onPress={() => navigation.goBack()}
            disabled={loading}
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
          >
            <Text className="font-semibold text-[#333333]">Back</Text>
          </Pressable>
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              loading && styles.submitBtnDisabled,
              pressed && !loading && styles.btnPressed,
            ]}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">Register farmer</Text>
            )}
          </Pressable>
        </View>

        {submitError ? <Text className="mb-3 text-sm text-[#D32F2F]">{submitError}</Text> : null}

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.scrollContent}
        >
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
            <SummaryRow
              label="Photo"
              value={formData.pictureUri || formData.pictureBase64 ? 'Uploaded' : 'Missing'}
              onEdit={() => navigation.navigate(STEP_SCREENS[6])}
            />
          </View>
        </ScrollView>
      </View>

      <RegistrationSuccessModal
        visible={!!success}
        farmerName={formData.name}
        farmerPhone={formData.phone}
        statusLabel="pending_review"
        farmerId={success?.farmerId}
        kbFarmerId={success?.kbFarmerId ?? kbFarmerId}
        offline={success?.offline}
        onViewProfile={viewProfile}
        onRegisterAnother={registerAnother}
        onClose={goToFarmersList}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  submitBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#1A4D3E',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' as const },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.65,
    ...Platform.select({
      web: { cursor: 'default' as const },
    }),
  },
  outlineBtn: {
    height: 48,
    minWidth: 96,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...Platform.select({
      web: { cursor: 'pointer' as const },
    }),
  },
  btnPressed: {
    opacity: 0.9,
  },
});
