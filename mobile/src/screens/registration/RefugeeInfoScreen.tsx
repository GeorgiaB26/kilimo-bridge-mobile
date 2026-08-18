import React, { useState } from 'react';
import { View, ActivityIndicator, Pressable, Platform, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  HUMANITARIAN_ASSISTANCE_TYPES,
  PREFERRED_LANGUAGES,
  SPECIAL_VULNERABILITIES_OPTIONS,
  VulnerabilityCheckboxGroup,
  humanitarianAssistanceForSubmit,
  preferredLanguageForSubmit,
  specialVulnerabilitiesForSubmit,
} from '../../components/registration/RefugeeRegistrationFields';
import { MAX_REFUGEE_DOCUMENT_BYTES } from '../../constants/refugeeRegistration';
import { useRegistrationStore } from '../../store/registrationStore';
import { showMessage } from '../../utils/feedback';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'RefugeeInfo'>;

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

export function RefugeeInfoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickingDoc, setPickingDoc] = useState(false);

  const pickDocument = async (useCamera: boolean) => {
    setPickingDoc(true);
    setErrors((e) => ({ ...e, refugeeStatusDocumentUrl: '' }));
    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showMessage('Permission needed', 'Allow camera access to photograph the document.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.85,
          base64: true,
        });
        if (!result.canceled && result.assets[0]) {
          const asset = result.assets[0];
          if (!asset.base64) {
            showMessage('Upload error', 'Could not read the photo. Try again.');
            return;
          }
          const bytes = Math.ceil((asset.base64.length * 3) / 4);
          if (bytes > MAX_REFUGEE_DOCUMENT_BYTES) {
            setErrors((e) => ({
              ...e,
              refugeeStatusDocumentUrl: 'File is too large (max 5MB). Compress and try again.',
            }));
            return;
          }
          updateForm({
            refugeeStatusDocumentUri: asset.uri,
            refugeeStatusDocumentBase64: asset.base64,
            refugeeStatusDocumentUrl: '',
          });
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_REFUGEE_DOCUMENT_BYTES) {
        setErrors((e) => ({
          ...e,
          refugeeStatusDocumentUrl: 'File is too large (max 5MB). Compress and try again.',
        }));
        return;
      }
      updateForm({
        refugeeStatusDocumentUri: asset.uri,
        refugeeStatusDocumentBase64: undefined,
        refugeeStatusDocumentUrl: '',
      });
    } finally {
      setPickingDoc(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const hasDoc =
      formData.refugeeStatusDocumentUrl?.trim() ||
      formData.refugeeStatusDocumentUri?.trim() ||
      formData.refugeeStatusDocumentBase64?.trim();
    if (!hasDoc) {
      e.refugeeStatusDocumentUrl = 'Refugee status document is required (PDF, JPG, or PNG)';
    }
    if (!humanitarianAssistanceForSubmit(formData)) {
      e.humanitarianAssistanceType = 'Please select an assistance type';
    }
    if (formData.humanitarianAssistanceType === 'Other' && !formData.humanitarianAssistanceOther?.trim()) {
      e.humanitarianAssistanceOther = 'Please specify assistance type';
    }
    const emergencyName = formData.emergencyContactName?.trim();
    if (!emergencyName) {
      e.emergencyContactName = 'Emergency contact name is required';
    } else if (emergencyName.toLowerCase() === formData.name?.trim().toLowerCase()) {
      e.emergencyContactName = 'Emergency contact cannot be the same as member name';
    }
    const emergencyPhone = normalizePhone(formData.emergencyContactPhone ?? '');
    if (!emergencyPhone) {
      e.emergencyContactPhone = 'Emergency contact phone is required';
    } else if (emergencyPhone === normalizePhone(formData.phone)) {
      e.emergencyContactPhone = 'Emergency contact phone must differ from member phone';
    }
    if (formData.preferredLanguage === 'Other' && !formData.preferredLanguageOther?.trim()) {
      e.preferredLanguageOther = 'Please specify language';
    }
    if (
      formData.specialVulnerabilities?.includes('Other') &&
      !formData.specialVulnerabilitiesOther?.trim()
    ) {
      e.specialVulnerabilitiesOther = 'Please specify vulnerability';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    updateForm({
      membershipCategory: 'Refugee',
      humanitarianAssistanceType: humanitarianAssistanceForSubmit(formData) ?? '',
      preferredLanguage: preferredLanguageForSubmit(formData) ?? formData.preferredLanguage,
      specialVulnerabilities: formData.specialVulnerabilities ?? [],
    });
    navigation.navigate('Details');
  };

  const docLabel =
    formData.refugeeStatusDocumentUrl?.trim() ||
    formData.refugeeStatusDocumentUri?.trim() ||
    formData.refugeeStatusDocumentBase64
      ? 'Document attached'
      : 'No document selected';

  return (
    <View className="flex-1">
      <ScreenHeader
        title="Refugee assistance"
        subtitle="Humanitarian program registration"
      />
      <View className="mb-4 rounded-lg border border-[#1A4D3E] bg-[#F0F7F4] p-3">
        <Text className="text-sm text-[#333333]">
          Humanitarian assistance programs — select Refugee to join food, shelter, medical, or cash
          transfer programs. Upload UN / UNHCR documentation for verification.
        </Text>
      </View>

      <Text className="mb-1 text-sm font-semibold text-[#333333]">Refugee status document *</Text>
      <Text className="mb-2 text-xs text-[#757575]">
        Upload UN ID, UNHCR certificate, or country-issued refugee document (PDF, JPG, PNG — max 5MB).
      </Text>
      <Text className="mb-2 text-sm text-[#1A4D3E]">{docLabel}</Text>
      {errors.refugeeStatusDocumentUrl ? (
        <Text className="mb-2 text-sm text-[#D32F2F]">{errors.refugeeStatusDocumentUrl}</Text>
      ) : null}
      <View className="mb-4 flex-row gap-2">
        <Pressable
          onPress={() => pickDocument(true)}
          disabled={pickingDoc}
          style={({ pressed }) => [styles.docBtn, pressed && styles.btnPressed]}
        >
          {pickingDoc ? (
            <ActivityIndicator color="#1A4D3E" />
          ) : (
            <Text className="font-semibold text-[#1A4D3E]">Take photo</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => pickDocument(false)}
          disabled={pickingDoc}
          style={({ pressed }) => [styles.docBtn, pressed && styles.btnPressed]}
        >
          <Text className="font-semibold text-[#1A4D3E]">Choose file</Text>
        </Pressable>
      </View>

      <PickerField
        label="What type of assistance do you need?"
        value={formData.humanitarianAssistanceType ?? ''}
        options={[...HUMANITARIAN_ASSISTANCE_TYPES]}
        onSelect={(humanitarianAssistanceType) =>
          updateForm({ humanitarianAssistanceType, humanitarianAssistanceOther: '' })
        }
        required
        error={errors.humanitarianAssistanceType}
      />
      {formData.humanitarianAssistanceType === 'Other' ? (
        <FormField
          label="Please specify assistance"
          value={formData.humanitarianAssistanceOther ?? ''}
          onChangeText={(humanitarianAssistanceOther) => updateForm({ humanitarianAssistanceOther })}
          required
          error={errors.humanitarianAssistanceOther}
        />
      ) : null}

      <PickerField
        label="Preferred language for communication"
        value={formData.preferredLanguage ?? 'English'}
        options={[...PREFERRED_LANGUAGES]}
        onSelect={(preferredLanguage) =>
          updateForm({ preferredLanguage, preferredLanguageOther: '' })
        }
      />
      {formData.preferredLanguage === 'Other' ? (
        <FormField
          label="Please specify language"
          value={formData.preferredLanguageOther ?? ''}
          onChangeText={(preferredLanguageOther) => updateForm({ preferredLanguageOther })}
          error={errors.preferredLanguageOther}
        />
      ) : null}

      <FormField
        label="Emergency contact name"
        value={formData.emergencyContactName ?? ''}
        onChangeText={(emergencyContactName) => updateForm({ emergencyContactName })}
        placeholder="Someone we can contact in an emergency"
        required
        error={errors.emergencyContactName}
      />
      <FormField
        label="Emergency contact phone"
        value={formData.emergencyContactPhone ?? ''}
        onChangeText={(emergencyContactPhone) => updateForm({ emergencyContactPhone })}
        placeholder="+254712345678"
        keyboardType="phone-pad"
        required
        error={errors.emergencyContactPhone}
      />

      <VulnerabilityCheckboxGroup
        label="Special vulnerabilities or needs"
        options={SPECIAL_VULNERABILITIES_OPTIONS}
        selected={formData.specialVulnerabilities ?? []}
        onChange={(specialVulnerabilities) =>
          updateForm({
            specialVulnerabilities,
            specialVulnerabilitiesOther:
              specialVulnerabilities.includes('Other') ? formData.specialVulnerabilitiesOther : '',
          })
        }
        helpText="Select any that apply. This helps us provide targeted support."
      />
      {formData.specialVulnerabilities?.includes('Other') ? (
        <FormField
          label="Please specify vulnerability"
          value={formData.specialVulnerabilitiesOther ?? ''}
          onChangeText={(specialVulnerabilitiesOther) => updateForm({ specialVulnerabilitiesOther })}
          error={errors.specialVulnerabilitiesOther}
        />
      ) : null}

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

const styles = StyleSheet.create({
  docBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1A4D3E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  btnPressed: { opacity: 0.85 },
});
