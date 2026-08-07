import React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/**
 * Dev-only NativeWind / React Native Reusables smoke test.
 * Confirms className styling works alongside Paper without touching existing screens.
 */
export function NativeWindSmokeTest() {
  if (!__DEV__) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-8 right-4 z-50"
    >
      <Button variant="secondary" size="sm" onPress={() => {}}>
        <Text>NW OK</Text>
      </Button>
    </View>
  );
}
