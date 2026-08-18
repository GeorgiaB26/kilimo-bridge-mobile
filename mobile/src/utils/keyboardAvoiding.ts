import { Platform, StatusBar } from 'react-native';

/** Web-only RN KeyboardAvoidingView behavior — native shells use keyboard-controller. */
export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.select({
  ios: 'padding' as const,
  android: 'height' as const,
  default: 'height' as const,
});

/** Web registration / sheets — padding matches the previous web path. */
export const PADDING_KEYBOARD_AVOIDING_BEHAVIOR = 'padding' as const;

/** Offset for bottom-sheet modals inside a translucent status-bar Modal (web). */
export function modalKeyboardVerticalOffset(): number {
  if (Platform.OS === 'ios') return 0;
  return StatusBar.currentHeight ?? 24;
}

/** Offset for full-screen screens with a fixed header above the composer (web). */
export function screenKeyboardVerticalOffset(headerHeight = 90): number {
  if (Platform.OS === 'ios') return headerHeight;
  return 0;
}
