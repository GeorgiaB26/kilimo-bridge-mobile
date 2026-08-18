import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';

interface Props {
  onPress: () => void;
  compact?: boolean;
}

export function RegisterNewFarmerButton({ onPress, compact }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Register new member"
      className={compact ? 'rounded-lg bg-[#FFD700] px-3 py-2' : 'rounded-lg bg-[#FFD700] px-4 py-3'}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Ionicons name="add" size={20} color="#000" />
      <Text className="text-sm font-bold text-black">
        {compact ? 'NEW MEMBER' : 'REGISTER NEW MEMBER'}
      </Text>
    </Pressable>
  );
}

export function RegisterNewFarmerBanner({ onPress }: Props) {
  return (
    <View className="mb-4 flex-row justify-end">
      <RegisterNewFarmerButton onPress={onPress} />
    </View>
  );
}
