import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';

const SLIDES = [
  {
    icon: 'cash-outline' as const,
    title: 'Earn Money',
    subtitle: 'Complete agricultural projects and get paid for your work across Kenya and Uganda.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'Get Paid Instantly',
    subtitle: 'Receive M-Pesa payments securely through Equity Bank — fast and reliable.',
  },
  {
    icon: 'people-outline' as const,
    title: 'Grow Together',
    subtitle: 'Join cooperatives, connect with agents, and build your farming future.',
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const next = () => {
    if (!isLast) {
      setIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  const back = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.slide}>
        <View style={styles.iconWrap}>
          <Ionicons name={slide.icon} size={64} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => setIndex(i)}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        <Button
          mode="contained"
          onPress={next}
          style={styles.btn}
          buttonColor={COLORS.primary}
          contentStyle={styles.btnContent}
        >
          {isLast ? 'Get Started' : 'Next'}
        </Button>

        <View style={styles.secondaryRow}>
          {index > 0 ? (
            <Button mode="text" onPress={back} textColor={COLORS.muted}>
              Back
            </Button>
          ) : (
            <View />
          )}
          {!isLast ? (
            <Button mode="text" onPress={onComplete} textColor={COLORS.muted}>
              Skip
            </Button>
          ) : (
            <View />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  slide: { flex: 1, padding: 32, justifyContent: 'center', alignItems: 'center' },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.primary, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: COLORS.muted, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  footer: { padding: 24, paddingBottom: 40 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
  btn: { borderRadius: 12, marginBottom: 8 },
  btnContent: { minHeight: 48 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
