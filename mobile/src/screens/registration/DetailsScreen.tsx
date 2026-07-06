import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Details'>;

export function DetailsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Details" subtitle="Additional information" />
      <FormField
        label="Occupation"
        value={formData.occupation ?? ''}
        onChangeText={(occupation) => updateForm({ occupation })}
        placeholder="Farmer, Teacher, etc."
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
        <Button title="Next" onPress={() => navigation.navigate('Projects')} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
