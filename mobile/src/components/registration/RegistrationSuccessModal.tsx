import React from 'react';
import { Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FarmerStatusChip } from '../agent/FarmerStatusChip';

interface Props {
  visible: boolean;
  farmerName: string;
  farmerPhone?: string;
  statusLabel?: string;
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
  farmerPhone,
  statusLabel = 'pending_review',
  farmerId,
  kbFarmerId,
  offline,
  onViewProfile,
  onRegisterAnother,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide">
      <View className="flex-1 items-center justify-center bg-[#1A4D3E] p-6">
        <View className="w-full max-w-md rounded-2xl bg-white p-6">
          <View className="mb-4 items-center">
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            <Text className="mt-3 text-xl font-bold text-[#1A4D3E]">
              {offline ? 'Saved Offline' : 'Farmer Registered!'}
            </Text>
          </View>

          <View className="mb-4 rounded-xl bg-[#F9F9F9] p-4">
            <Text className="text-lg font-bold text-[#333333]">{farmerName}</Text>
            {farmerPhone ? (
              <Text className="mt-1 text-base text-[#757575]">{farmerPhone}</Text>
            ) : null}
            {!offline ? (
              <View className="mt-3">
                <FarmerStatusChip status={statusLabel} />
              </View>
            ) : null}
            {kbFarmerId ? (
              <Text className="mt-2 text-sm font-semibold text-[#1A4D3E]">ID: {kbFarmerId}</Text>
            ) : null}
          </View>

          <Text className="mb-4 text-center text-[15px] text-[#757575]">
            {offline
              ? 'Saved on device. Push registration from the Farmers tab when online.'
              : 'Awaiting PM review, then field agent verification in person.'}
          </Text>

          {!offline && farmerId ? (
            <Button className="mb-2 h-12 bg-[#1A4D3E]" onPress={onViewProfile}>
              <Text className="text-white">View Farmer Profile</Text>
            </Button>
          ) : null}
          <Button variant="outline" className="mb-2 h-12 border-[#E0E0E0]" onPress={onRegisterAnother}>
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
