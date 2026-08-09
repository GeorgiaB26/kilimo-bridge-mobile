import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';

interface Props {
  onPress: () => void;
  compact?: boolean;
}

export function RegisterNewFarmerButton({ onPress, compact }: Props) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel="Register farmer"
        style={({ pressed }) => [styles.compactBtn, pressed ? styles.pressed : null]}
      >
        <Ionicons name="add" size={16} color="#000" />
        <Text style={styles.compactLabel} numberOfLines={1}>
          Register Farmer
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Register new farmer"
      style={({ pressed }) => [styles.fullBtn, pressed ? styles.pressed : null]}
    >
      <Ionicons name="add" size={20} color="#000" />
      <Text style={styles.fullLabel}>Register Farmer</Text>
    </Pressable>
  );
}

export function RegisterNewFarmerBanner({ onPress }: Props) {
  return (
    <View style={styles.banner}>
      <RegisterNewFarmerButton onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  compactBtn: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFD700',
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
  fullBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFD700',
  },
  fullLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  pressed: {
    opacity: 0.85,
  },
  banner: {
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
