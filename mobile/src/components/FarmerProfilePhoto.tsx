import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../constants';
import { isUsableFarmerPhotoUrl } from '../../shared/src/farmerPhoto';

interface FarmerProfilePhotoProps {
  name: string;
  pictureUrl?: string | null;
  size?: 'large' | 'hero';
  label?: string;
}

/**
 * Shows the farmer's real verification photo, or a "photo required" placeholder.
 * Never renders initials avatars.
 */
export function FarmerProfilePhoto({
  name,
  pictureUrl,
  size = 'large',
  label = 'Verification photo required',
}: FarmerProfilePhotoProps) {
  const dim = size === 'hero' ? 140 : 100;
  const ring = size === 'hero' ? 4 : 3;
  const hasPhoto = isUsableFarmerPhotoUrl(pictureUrl);

  return (
    <View style={[styles.wrap, { width: dim + ring * 2 + 8, height: dim + ring * 2 + 8 }]}>
      <View style={[styles.ring, { padding: ring, borderRadius: (dim + ring * 2) / 2 }]}>
        {hasPhoto ? (
          <Image
            source={{ uri: pictureUrl!.trim() }}
            style={[styles.image, { width: dim, height: dim, borderRadius: dim / 2 }]}
            accessibilityLabel={`${name} verification photo`}
          />
        ) : (
          <View style={[styles.placeholder, { width: dim, height: dim, borderRadius: dim / 2 }]}>
            <Ionicons name="camera-outline" size={size === 'hero' ? 40 : 32} color={COLORS.accent} />
            <Text className="mt-1 text-center text-[10px] font-semibold text-[#D4AF6A]">Photo required</Text>
          </View>
        )}
      </View>
      {!hasPhoto ? (
        <View style={styles.badge}>
          <Ionicons name="alert-circle" size={16} color={COLORS.alert} />
        </View>
      ) : null}
      {!hasPhoto && size === 'hero' ? (
        <Text className="mt-2 text-center text-xs text-white/80">{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ring: { backgroundColor: COLORS.accent },
  image: { resizeMode: 'cover' },
  placeholder: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.alert,
  },
});
