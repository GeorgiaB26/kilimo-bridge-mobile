import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { REGISTRATION_USER_TYPES } from '../../constants/registrationUserTypes';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';
import type { RegistrationUserType } from '../../constants/registrationUserTypes';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'UserTypeSelection'>;

export function UserTypeSelectionScreen({ navigation }: Props) {
  const { userType, setUserType, resetForm } = useRegistrationStore();
  const [selectedType, setSelectedType] = useState<RegistrationUserType | null>(userType);

  const handleNext = () => {
    if (!selectedType) {
      Alert.alert('Error', 'Please select an account type');
      return;
    }
    resetForm();
    setUserType(selectedType);

    switch (selectedType) {
      case 'farmer':
        navigation.navigate('Country');
        break;
      case 'field_agent':
        navigation.navigate('FieldAgentRegistration');
        break;
      case 'admin':
        navigation.navigate('StaffRegistration', { variant: 'admin' });
        break;
      case 'project_manager':
        navigation.navigate('StaffRegistration', { variant: 'project_manager' });
        break;
    }
  };

  return (
    <View className="flex-1 bg-white px-5 pb-6 pt-4">
      <Text className="mb-6 mt-2 text-2xl font-bold text-[#1f2937]">What are you signing up as?</Text>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {REGISTRATION_USER_TYPES.map((type) => {
          const selected = selectedType === type.id;
          return (
            <Pressable
              key={type.id}
              onPress={() => setSelectedType(type.id)}
              className={`mb-3 rounded-xl border-2 p-4 ${
                selected ? 'border-[#3b82f6] bg-[#f0f9ff]' : 'border-[#e5e7eb] bg-white'
              }`}
            >
              <View className="flex-row items-center">
                <Text className="mr-3 text-3xl">{type.icon}</Text>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-[#1f2937]">{type.label}</Text>
                  <Text className="mt-1 text-[13px] text-[#6b7280]">{type.description}</Text>
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-[#3b82f6]' : 'border-[#d1d5db]'
                  }`}
                >
                  {selected ? <View className="h-3 w-3 rounded-full bg-[#3b82f6]" /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Button
        className={`mt-4 h-12 rounded-lg ${selectedType ? 'bg-[#3b82f6]' : 'bg-[#d1d5db]'}`}
        disabled={!selectedType}
        onPress={handleNext}
      >
        <Text className="text-base font-semibold text-white">Next</Text>
      </Button>
    </View>
  );
}
