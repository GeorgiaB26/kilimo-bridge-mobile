import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { DISTRICTS, SUB_COUNTIES } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Location'>;

export function LocationScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const subCounties = formData.district ? SUB_COUNTIES[formData.district] ?? [] : [];

  useEffect(() => {
    if (formData.district && !subCounties.includes(formData.subCounty)) {
      updateForm({ subCounty: '' });
    }
  }, [formData.district]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.district) e.district = 'District is required';
    if (!formData.subCounty) e.subCounty = 'Sub-county is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Location" subtitle="Where are you based?" />
      <PickerField
        label="Country"
        value={formData.country}
        options={['Kenya']}
        onSelect={(country) => updateForm({ country })}
        required
      />
      <PickerField
        label="District"
        value={formData.district}
        options={[...DISTRICTS]}
        onSelect={(district) => updateForm({ district, subCounty: '' })}
        required
        error={errors.district}
      />
      <PickerField
        label="Sub-County"
        value={formData.subCounty}
        options={subCounties}
        onSelect={(subCounty) => updateForm({ subCounty })}
        required
        error={errors.subCounty}
        placeholder={formData.district ? 'Select sub-county' : 'Select district first'}
      />
      <FormField
        label="Parish"
        value={formData.parish ?? ''}
        onChangeText={(parish) => updateForm({ parish })}
        placeholder="Optional"
      />
      <FormField
        label="Village"
        value={formData.village ?? ''}
        onChangeText={(village) => updateForm({ village })}
        placeholder="Optional"
      />
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button
          title="Next"
          onPress={() => validate() && navigation.navigate('Membership')}
          style={styles.half}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
