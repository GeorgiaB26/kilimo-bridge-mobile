import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { KilimoLogo } from '../../components/KilimoLogo';
import { COLORS } from '../../constants';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    const t = setTimeout(onFinish, 2000);
    return () => clearTimeout(t);
  }, [onFinish]);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <KilimoLogo width={260} height={72} />
      </View>
      <Text style={styles.tagline}>Earn · Grow · Get Paid</Text>
      <ActivityIndicator animating color={COLORS.accent} size="large" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  tagline: { fontSize: 16, color: 'rgba(255,255,255,0.85)', marginBottom: 40 },
  spinner: { marginTop: 8 },
});
