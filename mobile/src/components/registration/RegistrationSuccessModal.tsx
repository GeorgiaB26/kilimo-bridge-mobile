import React from 'react';
import { Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

interface Props {
  visible: boolean;
  farmerName: string;
  farmerId?: string;
  kbFarmerId?: string;
  offline?: boolean;
  onViewProfile: () => void;
  onRegisterAnother: () => void;
  onClose: () => void;
}

export function RegistrationSuccessModal({
  visible,
  farmerName,
  farmerId,
  kbFarmerId,
  offline,
  onViewProfile,
  onRegisterAnother,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 items-center justify-center bg-black/50 p-6">
        <View className="w-full max-w-md rounded-2xl bg-white p-6">
          <View className="mb-4 items-center">
            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
            <Text className="mt-3 text-xl font-bold text-[#1A4D3E]">
              {offline ? 'Saved Offline' : 'Farmer Registered!'}
            </Text>
            <Text className="mt-2 text-center text-[15px] text-[#757575]">
              {offline
                ? `${farmerName} saved on device. Push registration when online.`
                : `${farmerName} has been registered and is awaiting field verification.`}
            </Text>
            {kbFarmerId ? (
              <Text className="mt-2 text-center text-sm font-semibold text-[#1A4D3E]">ID: {kbFarmerId}</Text>
            ) : null}
          </View>
          {!offline && farmerId ? (
            <Button className="mb-2 h-12 bg-[#1A4D3E]" onPress={onViewProfile}>
              <Text className="text-white">View Farmer Profile</Text>
            </Button>
          ) : null}
          <Button variant="outline" className="mb-2 h-12" onPress={onRegisterAnother}>
            <Text>Register Another Farmer</Text>
          </Button>
          <Button variant="ghost" className="h-11" onPress={onClose}>
            <Text>Back to Farmers List</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
