import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface RoleHeroHeaderProps {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function RoleHeroHeader({ title, subtitle, icon, accent, children, style }: RoleHeroHeaderProps) {
  return (
    <View style={[styles.hero, style]}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={28} color={accent ?? COLORS.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 20 },
});
