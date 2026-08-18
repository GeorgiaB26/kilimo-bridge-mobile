import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import {
  CORPORATE_CATEGORY_GROUPS,
  CORPORATE_CATEGORY_GROUP_LABELS,
  INDIVIDUAL_MEMBERSHIP_CATEGORIES,
  type CorporateCategoryGroup,
} from '../../constants/registrationCategories';
import { REFUGEE_MEMBERSHIP_CATEGORY } from '../../constants/refugeeRegistration';
import type { RegistrationFormData } from '../../types';

type Props = {
  formData: RegistrationFormData;
  updateForm: (data: Partial<RegistrationFormData>) => void;
  errors: Record<string, string>;
};

function buildMembershipCategoryValue(
  formData: RegistrationFormData
): string | undefined {
  if (formData.registrationCategory === 'corporate') {
    const group = formData.corporateCategoryGroup?.trim();
    if (!group) return undefined;
    if (group === 'Other') {
      const text = formData.corporateCategoryOther?.trim();
      return text ? `Other: ${text}` : undefined;
    }
    const sub = formData.corporateCategorySub?.trim();
    if (sub === 'Other') {
      const text = formData.corporateCategoryOther?.trim();
      return text ? `${group} - Other: ${text}` : undefined;
    }
    return sub ? `${group} - ${sub}` : group;
  }

  const cat = formData.membershipCategory?.trim();
  if (!cat) return undefined;
  if (cat === 'Other') {
    const text = formData.membershipCategoryOther?.trim();
    return text ? `Other: ${text}` : undefined;
  }
  return cat;
}

export function MembershipCategoryFields({ formData, updateForm, errors }: Props) {
  const isCorporate = formData.registrationCategory === 'corporate';
  const corporateGroup = formData.corporateCategoryGroup as CorporateCategoryGroup | '';
  const subOptions =
    corporateGroup && corporateGroup in CORPORATE_CATEGORY_GROUPS
      ? [...CORPORATE_CATEGORY_GROUPS[corporateGroup as CorporateCategoryGroup]]
      : [];

  return (
    <View>
      <PickerField
        label="Registration category"
        value={formData.registrationCategory ?? 'individual'}
        options={[
          { label: 'Individual member', value: 'individual' },
          { label: 'Corporate / organization', value: 'corporate' },
        ]}
        onSelect={(registrationCategory) =>
          updateForm({
            registrationCategory: registrationCategory as 'individual' | 'corporate',
            membershipCategory: '',
            membershipCategoryOther: '',
            corporateCategoryGroup: '',
            corporateCategorySub: '',
            corporateCategoryOther: '',
          })
        }
        required
      />

      {isCorporate ? (
        <>
          <PickerField
            label="Organization category"
            value={formData.corporateCategoryGroup ?? ''}
            options={CORPORATE_CATEGORY_GROUP_LABELS}
            onSelect={(corporateCategoryGroup) =>
              updateForm({
                corporateCategoryGroup,
                corporateCategorySub: '',
                corporateCategoryOther: '',
              })
            }
            required
            error={errors.membershipCategory}
          />
          {corporateGroup && corporateGroup !== 'Other' && subOptions.length > 0 ? (
            <PickerField
              label="Sub-category"
              value={formData.corporateCategorySub ?? ''}
              options={subOptions}
              onSelect={(corporateCategorySub) =>
                updateForm({ corporateCategorySub, corporateCategoryOther: '' })
              }
              required
              error={errors.corporateCategorySub}
            />
          ) : null}
          {(corporateGroup === 'Other' || formData.corporateCategorySub === 'Other') ? (
            <FormField
              label="Please specify category"
              value={formData.corporateCategoryOther ?? ''}
              onChangeText={(corporateCategoryOther) => updateForm({ corporateCategoryOther })}
              placeholder="Describe organization type"
              required
              error={errors.corporateCategoryOther}
            />
          ) : null}
        </>
      ) : (
        <>
          <PickerField
            label="Your occupation"
            value={formData.membershipCategory ?? ''}
            options={[...INDIVIDUAL_MEMBERSHIP_CATEGORIES]}
            onSelect={(membershipCategory) =>
              updateForm({
                membershipCategory,
                membershipCategoryOther: '',
                ...(membershipCategory !== REFUGEE_MEMBERSHIP_CATEGORY
                  ? {
                      refugeeStatusDocumentUrl: '',
                      refugeeStatusDocumentUri: undefined,
                      refugeeStatusDocumentBase64: undefined,
                      humanitarianAssistanceType: '',
                      humanitarianAssistanceOther: '',
                      emergencyContactName: '',
                      emergencyContactPhone: '',
                      specialVulnerabilities: [],
                      specialVulnerabilitiesOther: '',
                    }
                  : {}),
              })
            }
            required
            error={errors.membershipCategory}
          />
          {formData.membershipCategory === 'Other' ? (
            <FormField
              label="Please specify your occupation"
              value={formData.membershipCategoryOther ?? ''}
              onChangeText={(membershipCategoryOther) => updateForm({ membershipCategoryOther })}
              placeholder="e.g. Fisherman, beekeeper"
              required
              error={errors.membershipCategoryOther}
            />
          ) : null}
          {formData.membershipCategory === REFUGEE_MEMBERSHIP_CATEGORY ? (
            <View className="mb-3 rounded-lg border border-[#1A4D3E] bg-[#F0F7F4] p-3">
              <Text className="text-sm text-[#333333]">
                You selected Refugee — additional humanitarian assistance fields are required on the
                next step (document upload, emergency contact, assistance type).
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export function validateMembershipCategoryFields(
  formData: RegistrationFormData
): Record<string, string> {
  const e: Record<string, string> = {};
  const value = buildMembershipCategoryValue(formData);
  if (!value) {
    e.membershipCategory = isCorporateCategory(formData)
      ? 'Organization category is required'
      : 'Occupation category is required';
  }
  if (
    formData.registrationCategory === 'corporate' &&
    formData.corporateCategoryGroup &&
    formData.corporateCategoryGroup !== 'Other' &&
    CORPORATE_CATEGORY_GROUPS[formData.corporateCategoryGroup as CorporateCategoryGroup]?.length &&
    !formData.corporateCategorySub
  ) {
    e.corporateCategorySub = 'Sub-category is required';
  }
  if (formData.membershipCategory === 'Other' && !formData.membershipCategoryOther?.trim()) {
    e.membershipCategoryOther = 'Please specify your occupation';
  }
  if (
    (formData.corporateCategoryGroup === 'Other' ||
      formData.corporateCategorySub === 'Other') &&
    !formData.corporateCategoryOther?.trim()
  ) {
    e.corporateCategoryOther = 'Please specify the category';
  }
  return e;
}

function isCorporateCategory(formData: RegistrationFormData): boolean {
  return formData.registrationCategory === 'corporate';
}

export function membershipCategoryForSubmit(formData: RegistrationFormData): string | undefined {
  return buildMembershipCategoryValue(formData);
}
