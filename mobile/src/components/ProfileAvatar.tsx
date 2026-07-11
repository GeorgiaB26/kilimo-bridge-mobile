import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface ProfileAvatarProps {
  name: string;
  pictureUrl?: string | null;
  size?: 'large' | 'hero';
}

export function ProfileAvatar({ name, pictureUrl, size = 'large' }: ProfileAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const dim = size === 'hero' ? 140 : 100;
  const fontSize = size === 'hero' ? 48 : 36;
  const ring = size === 'hero' ? 4 : 3;

  return (
    <View style={[styles.wrap, { width: dim + ring * 2 + 8, height: dim + ring * 2 + 8 }]}>
      <View style={[styles.ring, { padding: ring, borderRadius: (dim + ring * 2) / 2 }]}>
        {pictureUrl ? (
          <Image
            source={{ uri: pictureUrl }}
            style={[styles.image, { width: dim, height: dim, borderRadius: dim / 2 }]}
            accessibilityLabel={`${name} profile photo`}
          />
        ) : (
          <View style={[styles.fallback, { width: dim, height: dim, borderRadius: dim / 2 }]}>
            <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
          </View>
        )}
      </View>
      {!pictureUrl ? (
        <View style={styles.badge}>
          <Ionicons name="person" size={14} color={COLORS.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ring: { backgroundColor: COLORS.accent },
  image: { resizeMode: 'cover' },
  fallback: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: COLORS.accent, fontWeight: '800' },
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
    borderColor: COLORS.accent,
  },
});
