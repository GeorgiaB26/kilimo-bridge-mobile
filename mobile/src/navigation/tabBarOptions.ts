import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

/** Fixes tab bar cut-off on iOS/Android (bug #47). */
export function useRoleTabBarStyle() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 10);
  return {
    backgroundColor: COLORS.background,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 52 + bottomPad,
    paddingBottom: bottomPad,
    paddingTop: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  };
}

export const roleTabScreenOptions = {
  headerStyle: { backgroundColor: COLORS.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600' as const },
  tabBarActiveTintColor: COLORS.primary,
  tabBarInactiveTintColor: COLORS.muted,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  tabBarHideOnKeyboard: true,
};
