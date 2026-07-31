import React from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '../../components/FormField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Details'>;

export function DetailsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();

  return (
    <View className="flex-1">
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
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button className="h-12 flex-1 bg-[#1A4D3E]" onPress={() => navigation.navigate('Projects')}>
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
