import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, FlatList, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';

const { width } = Dimensions.get('window');

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
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      onComplete();
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={64} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button mode="contained" onPress={next} style={styles.btn} buttonColor={COLORS.primary}>
          {index === SLIDES.length - 1 ? 'Get Started' : 'Next'}
        </Button>
        {index < SLIDES.length - 1 ? (
          <Button mode="text" onPress={onComplete} textColor={COLORS.muted}>
            Skip
          </Button>
        ) : null}
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
});
