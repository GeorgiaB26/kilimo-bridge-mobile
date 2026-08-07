import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const TAB_SCENE_BG = '#F5F5F5';

/** Web: hide inactive bottom-tab scenes and block pointer events on stacked layers. */
export function AgentTabScene({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();

  if (Platform.OS === 'web' && !isFocused) {
    return <View style={styles.hidden} pointerEvents="none" />;
  }

  return (
    <View
      style={[styles.scene, Platform.OS === 'web' && isFocused && styles.sceneFocused]}
      pointerEvents="box-none"
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
  sceneFocused: {
    zIndex: 10,
    position: 'relative',
  },
  hidden: {
    flex: 1,
    display: 'none',
    opacity: 0,
    pointerEvents: 'none',
  },
});
