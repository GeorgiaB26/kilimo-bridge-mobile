import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  HUMANITARIAN_ASSISTANCE_TYPES,
  PREFERRED_LANGUAGES,
  SPECIAL_VULNERABILITIES_OPTIONS,
} from '../../constants/refugeeRegistration';
import type { RegistrationFormData } from '../../types';

export function humanitarianAssistanceForSubmit(formData: RegistrationFormData): string | undefined {
  const type = formData.humanitarianAssistanceType?.trim();
  if (!type) return undefined;
  if (type === 'Other') {
    const text = formData.humanitarianAssistanceOther?.trim();
    return text ? `Other: ${text}` : undefined;
  }
  return type;
}

export function preferredLanguageForSubmit(formData: RegistrationFormData): string | undefined {
  const lang = formData.preferredLanguage?.trim();
  if (!lang) return undefined;
  if (lang === 'Other') {
    const text = formData.preferredLanguageOther?.trim();
    return text ? `Other: ${text}` : lang;
  }
  return lang;
}

export function specialVulnerabilitiesForSubmit(formData: RegistrationFormData): string | undefined {
  const selected = formData.specialVulnerabilities ?? [];
  const parts = [...selected];
  if (selected.includes('Other') && formData.specialVulnerabilitiesOther?.trim()) {
    const idx = parts.indexOf('Other');
    if (idx >= 0) parts[idx] = `Other: ${formData.specialVulnerabilitiesOther.trim()}`;
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

type CheckboxGroupProps = {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  helpText?: string;
};

export function VulnerabilityCheckboxGroup({
  label,
  options,
  selected,
  onChange,
  helpText,
}: CheckboxGroupProps) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((o) => o !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-semibold text-[#333333]">{label}</Text>
      {helpText ? <Text className="mb-2 text-xs text-[#757575]">{helpText}</Text> : null}
      {options.map((option) => {
        const checked = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => toggle(option)}
            className="mb-2 flex-row items-center py-2"
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <View
              className={`mr-3 h-6 w-6 items-center justify-center rounded border-2 ${
                checked ? 'border-[#1A4D3E] bg-[#1A4D3E]' : 'border-[#BDBDBD] bg-white'
              }`}
            >
              {checked ? <Text className="text-xs font-bold text-white">✓</Text> : null}
            </View>
            <Text className="flex-1 text-sm text-[#333333]">{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export { HUMANITARIAN_ASSISTANCE_TYPES, PREFERRED_LANGUAGES, SPECIAL_VULNERABILITIES_OPTIONS };
