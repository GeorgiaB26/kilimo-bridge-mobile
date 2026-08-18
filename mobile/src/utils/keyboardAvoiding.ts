import { useEffect, useRef, type RefObject } from 'react';
import {
  Platform,
  StatusBar,
  ScrollView,
  TextInput,
  Keyboard,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';

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

/** Matches the device-proven Notes delay — wait for Android IME + KAV padding. */
export const SHEET_SCROLL_INTO_VIEW_DELAY_MS = 280;

const EDGE_PADDING = 24;
/** Keep a button / char-count under the focused field in view when it fits. */
const BELOW_FIELD_PADDING = 80;

type WindowMeasurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

function isWindowMeasurable(value: unknown): value is WindowMeasurable {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as WindowMeasurable).measureInWindow === 'function'
  );
}

/**
 * Scroll a sheet ScrollView so the focused TextInput sits in the KAV-shrunk
 * viewport. Last fields keep ~80px below them visible (Notes + Submit).
 */
export function scrollFocusedInputIntoView(
  scrollView: ScrollView | null,
  contentOffsetY: number,
): void {
  if (!scrollView || Platform.OS === 'web') return;
  const focused = TextInput.State.currentlyFocusedInput?.();
  if (!isWindowMeasurable(focused) || !isWindowMeasurable(scrollView)) return;

  scrollView.measureInWindow((_sx, sy, _sw, sh) => {
    if (sh <= 0) return;
    focused.measureInWindow((_ix, iy, iw, ih) => {
      if (iw <= 0 && ih <= 0) {
        scrollView.scrollToEnd({ animated: true });
        return;
      }
      const visTop = sy;
      const visBottom = sy + sh;
      let delta = 0;
      if (iy + ih + BELOW_FIELD_PADDING > visBottom - EDGE_PADDING) {
        delta = iy + ih + BELOW_FIELD_PADDING - (visBottom - EDGE_PADDING);
      } else if (iy < visTop + EDGE_PADDING) {
        delta = iy - visTop - EDGE_PADDING;
      }
      if (Math.abs(delta) < 4) return;
      scrollView.scrollTo({
        y: Math.max(0, contentOffsetY + delta),
        animated: true,
      });
    });
  });
}

/**
 * Keyboard show → scroll focused input into view. Used by KeyboardBottomSheet
 * and RegistrationKeyboardLayout so both share the same timing and measure logic.
 */
export function useScrollFocusedInputIntoView(
  scrollRef: RefObject<ScrollView | null>,
  enabled: boolean,
  onScrollProp?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void,
): (e: NativeSyntheticEvent<NativeScrollEvent>) => void {
  const contentOffsetYRef = useRef(0);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    const run = () => {
      requestAnimationFrame(() => {
        scrollFocusedInputIntoView(scrollRef.current, contentOffsetYRef.current);
      });
      setTimeout(() => {
        scrollFocusedInputIntoView(scrollRef.current, contentOffsetYRef.current);
      }, SHEET_SCROLL_INTO_VIEW_DELAY_MS);
    };

    const subs = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        run,
      ),
    ];
    if (Platform.OS === 'ios') {
      subs.push(Keyboard.addListener('keyboardDidShow', run));
    }

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [enabled, scrollRef]);

  return (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    contentOffsetYRef.current = e.nativeEvent.contentOffset.y;
    onScrollProp?.(e);
  };
}
