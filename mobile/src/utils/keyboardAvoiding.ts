import { Platform, StatusBar } from 'react-native';

/** KeyboardAvoidingView behavior — enabled on Android (not undefined). */
export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.select({
  ios: 'padding' as const,
  android: 'height' as const,
  default: 'height' as const,
});

/** Offset for bottom-sheet modals inside a translucent status-bar Modal. */
export function modalKeyboardVerticalOffset(): number {
  if (Platform.OS === 'ios') return 0;
  return StatusBar.currentHeight ?? 24;
}

/** Offset for full-screen screens with a fixed header above the composer. */
export function screenKeyboardVerticalOffset(headerHeight = 90): number {
  if (Platform.OS === 'ios') return headerHeight;
  return 0;
}
