import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { OCCUPATION_OPTIONS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Details'>;

export function DetailsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.occupation?.trim()) e.occupation = 'Occupation is required';
    if (!formData.yearsOfExperience?.trim()) e.yearsOfExperience = 'Years of experience is required';
    else if (!/^\d+$/.test(formData.yearsOfExperience.trim())) e.yearsOfExperience = 'Enter a valid number';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onNext = () => {
    if (!validate()) return;
    navigation.navigate('Projects');
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Experience" subtitle="Occupation and farming experience" />
      <PickerField
        label="Occupation / Profession"
        value={formData.occupation ?? ''}
        options={OCCUPATION_OPTIONS.map((o) => ({ label: o, value: o }))}
        onSelect={(occupation) => updateForm({ occupation })}
        placeholder="Select occupation"
        error={errors.occupation}
      />
      <FormField
        label="Years of Experience"
        value={formData.yearsOfExperience ?? ''}
        onChangeText={(yearsOfExperience) => updateForm({ yearsOfExperience })}
        placeholder="e.g. 5"
        keyboardType="number-pad"
        error={errors.yearsOfExperience}
      />
      <FormField
        label="Size of Land (acres)"
        value={formData.sizeOfLand ?? ''}
        onChangeText={(sizeOfLand) => updateForm({ sizeOfLand })}
        placeholder="2.5"
        keyboardType="decimal-pad"
      />
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={onNext} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
