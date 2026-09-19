import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const TAB_SCENE_BG = '#F5F5F5';

/**
 * Web: react-native-screens does not detach inactive bottom-tab scenes, so every
 * tab stays painted (z-index stack). Hide inactive tabs so only one screen shows,
 * but keep children mounted so dashboard KPI deep-links (filter params) apply
 * without remounting into an empty loading race.
 */
export function AgentTabScene({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  return (
    <View
      style={[styles.scene, Platform.OS === 'web' && !isFocused ? styles.hidden : null]}
      pointerEvents={isFocused ? 'auto' : 'none'}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? 'yes' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    flex: 1,
    backgroundColor: TAB_SCENE_BG,
  },
  hidden: {
    display: 'none',
    opacity: 0,
  },
});
