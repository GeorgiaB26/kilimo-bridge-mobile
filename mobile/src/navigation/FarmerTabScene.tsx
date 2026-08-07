import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const TAB_SCENE_BG = '#F5F5F5';

/**
 * Web: react-native-screens does not detach inactive bottom-tab scenes, so every
 * tab stays painted (z-index stack). Hide inactive tabs so only one screen shows.
 */
export function FarmerTabScene({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  if (Platform.OS === 'web' && !isFocused) {
    return <View style={styles.hidden} />;
  }

  return <View style={styles.scene}>{children}</View>;
}

const styles = StyleSheet.create({
  scene: {
    flex: 1,
    backgroundColor: TAB_SCENE_BG,
  },
  hidden: {
    flex: 1,
    display: 'none',
  },
});
