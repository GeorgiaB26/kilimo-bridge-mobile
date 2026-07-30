import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface QuickRoleCardProps {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
  color?: string;
}

export function QuickRoleCard({ label, description, icon, onPress, loading, color }: QuickRoleCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed, loading && styles.loading]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: color ?? COLORS.primary }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.desc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  loading: { opacity: 0.6 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
