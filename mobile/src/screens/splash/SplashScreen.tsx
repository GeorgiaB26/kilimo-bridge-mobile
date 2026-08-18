import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/text';
import { KilimoLogo } from '../../components/KilimoLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    const t = setTimeout(onFinish, 2000);
    return () => clearTimeout(t);
  }, [onFinish]);

  return (
    <View className="flex-1 items-center justify-center bg-black p-6">
      <KilimoLogo size={200} />
      <Text className="mb-2 mt-6 text-lg font-bold text-white">Kilimo Bridge Platform</Text>
      <Text className="mb-10 text-base text-white/85">Earn · Grow · Get Paid</Text>
      <ActivityIndicator animating color="#D4AF6A" size="large" className="mt-2" />
    </View>
  );
}
