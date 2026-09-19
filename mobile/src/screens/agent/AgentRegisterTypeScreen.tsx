import React from 'react';
import { View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Sprout, UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useRegistrationStore } from '../../store/registrationStore';
import type { AgentFarmersStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgentFarmersStackParamList, 'RegisterPicker'>;

export function AgentRegisterTypeScreen({ navigation }: Props) {
  const resetForm = useRegistrationStore((s) => s.resetForm);
  const setUserType = useRegistrationStore((s) => s.setUserType);

  const startFarmer = () => {
    resetForm();
    setUserType('farmer');
    navigation.navigate('RegisterFarmerFlow');
  };

  const startFieldAgent = () => {
    navigation.navigate('RegisterFieldAgent');
  };

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <Text className="mb-2 text-[22px] font-bold text-[#1A4D3E]">Who are you registering?</Text>
      <Text className="mb-6 text-sm text-[#757575]">
        Choose whether you are adding a member to your region or requesting a new field agent account.
      </Text>

      <Pressable
        onPress={startFarmer}
        className="mb-3 rounded-xl border-2 border-[#1A4D3E] bg-white p-4 active:opacity-90"
      >
        <View className="flex-row items-center gap-3">
          <Sprout size={28} color="#1A4D3E" />
          <View className="flex-1">
            <Text className="text-lg font-bold text-[#1A4D3E]">Member</Text>
            <Text className="mt-1 text-sm text-[#757575]">Register a member in your aggregation centre</Text>
          </View>
        </View>
      </Pressable>

      <Pressable
        onPress={startFieldAgent}
        className="mb-6 rounded-xl border-2 border-[#E8E8E8] bg-white p-4 active:opacity-90"
      >
        <View className="flex-row items-center gap-3">
          <UserRound size={28} color="#1A4D3E" />
          <View className="flex-1">
            <Text className="text-lg font-bold text-[#333333]">Field Agent</Text>
            <Text className="mt-1 text-sm text-[#757575]">
              Request a new field agent — reviewed by your project manager
            </Text>
          </View>
        </View>
      </Pressable>

      <Button variant="outline" size="pill" onPress={() => navigation.goBack()}>
        <Text className="font-semibold">Cancel</Text>
      </Button>
    </View>
  );
}
