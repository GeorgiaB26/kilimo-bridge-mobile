import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { RegistrationSuccessModal } from '../../components/registration/RegistrationSuccessModal';
import { GENDER_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { getCountryConfig, generateFarmerId } from '../../constants/regional';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import { isRefugeeCategory } from '../../constants/refugeeRegistration';
import {
  humanitarianAssistanceForSubmit,
  preferredLanguageForSubmit,
  specialVulnerabilitiesForSubmit,
} from '../../components/registration/RefugeeRegistrationFields';
import { submitFarmerRegistration } from '../../services/submitFarmerRegistration';
import { extractApiError, showMessage } from '../../utils/feedback';
import { submitFarmerRegistration } from '../../services/submitFarmerRegistration';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Confirm'>;

type FarmerRegScreen =
  | 'Country'
  | 'BasicInfo'
  | 'Location'
  | 'Membership'
  | 'RefugeeInfo'
  | 'CorporateInfo'
  | 'Details'
  | 'Projects'
  | 'Photo';

const STEP_SCREENS: FarmerRegScreen[] = [
  'Country', 'BasicInfo', 'Location', 'Membership', 'Details', 'Projects', 'Photo',
];

function registrationCategoryLabel(category?: string): string {
  if (category === 'corporate') return 'Corporate / organization';
  if (category === 'individual') return 'Individual member';
  return category ?? '—';
}

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
    navigation.getParent()?.goBack();
  };

  const handleSubmit = async () => {
    if (!formData.pictureBase64 && !formData.pictureUri) {
      const msg = 'A verification photo is required. Go back to the Photo step and add one.';
      setSubmitError(msg);
      showMessage('Photo required', msg);
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
      showMessage('Member registered', `${formData.name} was registered successfully.`);
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Please check your details and try again.');
      setSubmitError(msg);
      showMessage('Registration failed', msg);
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

  const isCorporate = formData.registrationCategory === 'corporate';
  const isRefugee = isRefugeeCategory(formData.membershipCategory);
  const membershipStep: FarmerRegScreen = 'Membership';
  const refugeeStep: FarmerRegScreen = 'RefugeeInfo';
  const detailsStep: FarmerRegScreen = isCorporate ? 'CorporateInfo' : 'Details';
  const projectsStep: FarmerRegScreen = 'Projects';
  const landLabel = formData.sizeOfLand ? `${formData.sizeOfLand} ${formData.landUnit ?? 'Ha'}` : '';

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
              <Text className="font-semibold text-white">Register member</Text>
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
            <SummaryRow label="Membership Group" value={formData.membershipGroup} onEdit={() => navigation.navigate(membershipStep)} />
            <SummaryRow label="Aggregation Centre" value={formData.aggregationCenter ?? ''} onEdit={() => navigation.navigate(membershipStep)} />
            <SummaryRow
              label="Registration category"
              value={registrationCategoryLabel(formData.registrationCategory)}
              onEdit={() => navigation.navigate(membershipStep)}
            />
            {formData.membershipCategory ? (
              <SummaryRow
                label={isCorporate ? 'Organization category' : 'Occupation category'}
                value={formData.membershipCategory}
                onEdit={() => navigation.navigate(membershipStep)}
              />
            ) : null}
            {isRefugee ? (
              <>
                <SummaryRow
                  label="Refugee document"
                  value={
                    formData.refugeeStatusDocumentUrl ||
                    formData.refugeeStatusDocumentUri ||
                    formData.refugeeStatusDocumentBase64
                      ? 'Uploaded'
                      : 'Missing'
                  }
                  onEdit={() => navigation.navigate(refugeeStep)}
                />
                <SummaryRow
                  label="Assistance type"
                  value={humanitarianAssistanceForSubmit(formData) ?? formData.humanitarianAssistanceType ?? ''}
                  onEdit={() => navigation.navigate(refugeeStep)}
                />
                <SummaryRow
                  label="Preferred language"
                  value={preferredLanguageForSubmit(formData) ?? formData.preferredLanguage ?? ''}
                  onEdit={() => navigation.navigate(refugeeStep)}
                />
                <SummaryRow
                  label="Emergency contact"
                  value={formData.emergencyContactName ?? ''}
                  onEdit={() => navigation.navigate(refugeeStep)}
                />
                <SummaryRow
                  label="Emergency phone"
                  value={formData.emergencyContactPhone ?? ''}
                  onEdit={() => navigation.navigate(refugeeStep)}
                />
                {specialVulnerabilitiesForSubmit(formData) ? (
                  <SummaryRow
                    label="Vulnerabilities"
                    value={specialVulnerabilitiesForSubmit(formData)!}
                    onEdit={() => navigation.navigate(refugeeStep)}
                  />
                ) : null}
              </>
            ) : null}
            {isCorporate ? (
              <>
                <SummaryRow
                  label="Organization name"
                  value={formData.organizationName ?? ''}
                  onEdit={() => navigation.navigate('CorporateInfo')}
                />
                <SummaryRow
                  label="Registration number"
                  value={formData.organizationRegistrationNumber ?? ''}
                  onEdit={() => navigation.navigate('CorporateInfo')}
                />
                <SummaryRow label="Tax PIN" value={formData.taxPin ?? ''} onEdit={() => navigation.navigate('CorporateInfo')} />
                <SummaryRow
                  label="Contact person"
                  value={formData.contactPersonName ?? ''}
                  onEdit={() => navigation.navigate('CorporateInfo')}
                />
                <SummaryRow
                  label="Contact role"
                  value={formData.contactPersonRole ?? ''}
                  onEdit={() => navigation.navigate('CorporateInfo')}
                />
                {formData.contactPersonEmail ? (
                  <SummaryRow
                    label="Contact email"
                    value={formData.contactPersonEmail}
                    onEdit={() => navigation.navigate('CorporateInfo')}
                  />
                ) : null}
              </>
            ) : (
              <>
                {formData.ward ? (
                  <SummaryRow label="Ward" value={formData.ward} onEdit={() => navigation.navigate(detailsStep)} />
                ) : null}
                {formData.familySize ? (
                  <SummaryRow label="Family size" value={formData.familySize} onEdit={() => navigation.navigate(detailsStep)} />
                ) : null}
                {formData.numberOfDependants ? (
                  <SummaryRow
                    label="Dependants"
                    value={formData.numberOfDependants}
                    onEdit={() => navigation.navigate(detailsStep)}
                  />
                ) : null}
                {formData.profession ? (
                  <SummaryRow label="Profession" value={formData.profession} onEdit={() => navigation.navigate(detailsStep)} />
                ) : null}
                {formData.specialNeeds ? (
                  <SummaryRow
                    label="Special needs"
                    value={formData.specialNeeds === 'yes' ? 'Yes' : 'No'}
                    onEdit={() => navigation.navigate(detailsStep)}
                  />
                ) : null}
                {landLabel ? (
                  <SummaryRow label="Size of land" value={landLabel} onEdit={() => navigation.navigate(detailsStep)} />
                ) : null}
                {formData.farmInputRequired ? (
                  <SummaryRow
                    label="Farm input required"
                    value={formData.farmInputRequired}
                    onEdit={() => navigation.navigate(detailsStep)}
                  />
                ) : null}
                {formData.projectLocationGps ? (
                  <SummaryRow
                    label="Project GPS"
                    value={formData.projectLocationGps}
                    onEdit={() => navigation.navigate(detailsStep)}
                  />
                ) : null}
                {!formData.skipProjectEnrolment && formData.projectEnrolmentProjectId ? (
                  <SummaryRow
                    label="Project enrolment"
                    value="Selected"
                    onEdit={() => navigation.navigate(projectsStep)}
                  />
                ) : formData.skipProjectEnrolment ? (
                  <SummaryRow label="Project enrolment" value="Skipped" onEdit={() => navigation.navigate(projectsStep)} />
                ) : null}
              </>
            )}
            {formData.occupation ? (
              <SummaryRow label="Occupation" value={formData.occupation} onEdit={() => navigation.navigate(detailsStep)} />
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
