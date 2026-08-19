import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';

interface Props {
  onPress: () => void;
  compact?: boolean;
}

const COMPACT_ICON = 22;

export function RegisterNewFarmerButton({ onPress, compact }: Props) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Register new member"
        accessibilityHint="Open register new member"
        style={styles.compactHit}
      >
        <Ionicons name="person-add-outline" size={COMPACT_ICON} color="#fff" />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Register new member"
      className="rounded-lg bg-[#FFD700] px-4 py-3"
      style={styles.fullBtn}
    >
      <Ionicons name="add" size={20} color="#000" />
      <Text className="text-sm font-bold text-black">REGISTER NEW MEMBER</Text>
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

const styles = StyleSheet.create({
  compactHit: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
