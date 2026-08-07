import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const TAB_SCENE_BG = '#F5F5F5';

/** Web: hide inactive bottom-tab scenes (same issue as farmer floating tabs). */
export function AgentTabScene({ children }: { children: React.ReactNode }) {
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
