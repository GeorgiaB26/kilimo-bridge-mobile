import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { KilimoLogo } from '../../components/KilimoLogo';

const SLIDES = [
  {
    icon: 'cash-outline' as const,
    title: 'Earn Money',
    subtitle: 'Complete agricultural projects and get paid across East Africa — Kenya, Uganda, and beyond.',
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
    <View className="flex-1 bg-white">
      <View className="items-center pb-2 pt-12">
        <KilimoLogo width={180} height={50} />
      </View>
      <View className="flex-1 items-center justify-center p-8">
        <View className="mb-8 h-[120px] w-[120px] items-center justify-center rounded-full bg-[#F5F5F5]">
          <Ionicons name={slide.icon} size={64} color="#1A4D3E" />
        </View>
        <Text className="mb-3 text-center text-[28px] font-bold text-[#1A4D3E]">{slide.title}</Text>
        <Text className="max-w-[300px] text-center text-base leading-6 text-[#757575]">{slide.subtitle}</Text>
      </View>

      <View className="p-6 pb-10">
        <View className="mb-5 flex-row justify-center gap-2">
          {SLIDES.map((_, i) => (
            <Pressable key={i} onPress={() => setIndex(i)}>
              <View
                className={cn(
                  'h-2 rounded-full bg-[#E0E0E0]',
                  i === index ? 'w-6 bg-[#1A4D3E]' : 'w-2'
                )}
              />
            </Pressable>
          ))}
        </View>

        <Button className="mb-2 h-12 rounded-xl bg-[#1A4D3E]" onPress={next}>
          <Text className="text-white">{isLast ? 'Get Started' : 'Next'}</Text>
        </Button>

        <View className="flex-row justify-between">
          {index > 0 ? (
            <Button variant="ghost" onPress={back}>
              <Text className="text-[#757575]">Back</Text>
            </Button>
          ) : (
            <View />
          )}
          {!isLast ? (
            <Button variant="ghost" onPress={onComplete}>
              <Text className="text-[#757575]">Skip</Text>
            </Button>
          ) : (
            <View />
          )}
        </View>
      </View>
    </View>
  );
}
