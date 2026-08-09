import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Sprout, UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useRegistrationStore } from '../../store/registrationStore';
import type { AgentFarmersStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AgentFarmersStackParamList, 'RegisterPicker'>;

type RegisterChoice = 'farmer' | 'field_agent';

export function AgentRegisterTypeScreen({ navigation }: Props) {
  const resetForm = useRegistrationStore((s) => s.resetForm);
  const setUserType = useRegistrationStore((s) => s.setUserType);
  const [selected, setSelected] = useState<RegisterChoice | null>(null);
  const [error, setError] = useState('');

  const handleContinue = () => {
    if (!selected) {
      setError('Please select who you are registering');
      return;
    }
    setError('');
    if (selected === 'farmer') {
      resetForm();
      setUserType('farmer');
      navigation.navigate('RegisterFarmerFlow');
      return;
    }
    navigation.navigate('RegisterFieldAgent');
  };

  return (
    <View className="flex-1 bg-[#F5F5F5] p-4">
      <Text className="mb-2 text-[22px] font-bold text-[#1A4D3E]">Who are you registering?</Text>
      <Text className="mb-6 text-sm text-[#757575]">
        Choose whether you are adding a farmer to your region or requesting a new field agent account.
      </Text>

      <Pressable
        onPress={() => {
          setSelected('farmer');
          setError('');
        }}
        className={`mb-3 rounded-xl border-2 bg-white p-4 active:opacity-90 ${
          selected === 'farmer' ? 'border-[#1A4D3E] bg-[#E8F5F0]' : 'border-[#E8E8E8]'
        }`}
      >
        <View className="flex-row items-center gap-3">
          <Sprout size={28} color="#1A4D3E" />
          <View className="flex-1">
            <Text
              className={`text-lg font-bold ${
                selected === 'farmer' ? 'text-[#1A4D3E]' : 'text-[#333333]'
              }`}
            >
              Farmer
            </Text>
            <Text className="mt-1 text-sm text-[#757575]">
              Register a farmer in your aggregation centre
            </Text>
          </View>
          <View
            className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
              selected === 'farmer' ? 'border-[#1A4D3E]' : 'border-[#D1D5DB]'
            }`}
          >
            {selected === 'farmer' ? (
              <View className="h-3 w-3 rounded-full bg-[#1A4D3E]" />
            ) : null}
          </View>
        </View>
      </Pressable>

      <Pressable
        onPress={() => {
          setSelected('field_agent');
          setError('');
        }}
        className={`mb-4 rounded-xl border-2 bg-white p-4 active:opacity-90 ${
          selected === 'field_agent' ? 'border-[#1A4D3E] bg-[#E8F5F0]' : 'border-[#E8E8E8]'
        }`}
      >
        <View className="flex-row items-center gap-3">
          <UserRound size={28} color="#1A4D3E" />
          <View className="flex-1">
            <Text
              className={`text-lg font-bold ${
                selected === 'field_agent' ? 'text-[#1A4D3E]' : 'text-[#333333]'
              }`}
            >
              Field Agent
            </Text>
            <Text className="mt-1 text-sm text-[#757575]">
              Request a new field agent — reviewed by your project manager
            </Text>
          </View>
          <View
            className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
              selected === 'field_agent' ? 'border-[#1A4D3E]' : 'border-[#D1D5DB]'
            }`}
          >
            {selected === 'field_agent' ? (
              <View className="h-3 w-3 rounded-full bg-[#1A4D3E]" />
            ) : null}
          </View>
        </View>
      </Pressable>

      {error ? <Text className="mb-3 text-sm text-[#D32F2F]">{error}</Text> : null}

      <Button
        className={`mb-3 h-12 ${selected ? 'bg-[#1A4D3E]' : 'bg-[#C8C8C8]'}`}
        disabled={!selected}
        onPress={handleContinue}
      >
        <Text className="text-white">Continue</Text>
      </Button>

      <Button variant="outline" onPress={() => navigation.goBack()}>
        <Text>Cancel</Text>
      </Button>
    </View>
  );
}
