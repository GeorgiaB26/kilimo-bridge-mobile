import { useEffect, useRef, type RefObject } from 'react';
import {
  Platform,
  StatusBar,
  ScrollView,
  TextInput,
  Keyboard,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type KeyboardEvent,
} from 'react-native';

/** KeyboardAvoidingView behavior — enabled on Android (not undefined). */
export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.select({
  ios: 'padding' as const,
  android: 'height' as const,
  default: 'height' as const,
});

/**
 * Android `height` fights `adjustResize`. Use for bottom sheets and registration.
 * Full-screen composers still use KEYBOARD_AVOIDING_BEHAVIOR.
 */
export const PADDING_KEYBOARD_AVOIDING_BEHAVIOR = 'padding' as const;

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
 * Scroll so the focused TextInput sits above the keyboard (and in the ScrollView).
 * `keyboardTop` is `event.endCoordinates.screenY` from keyboard show.
 */
export function scrollFocusedInputIntoView(
  scrollView: ScrollView | null,
  contentOffsetY: number,
  keyboardTop?: number,
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
      const scrollBottom = sy + sh;
      const visBottom =
        keyboardTop != null && keyboardTop > visTop
          ? Math.min(scrollBottom, keyboardTop)
          : scrollBottom;
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

    const run = (event?: KeyboardEvent) => {
      const keyboardTop = event?.endCoordinates?.screenY;
      requestAnimationFrame(() => {
        scrollFocusedInputIntoView(scrollRef.current, contentOffsetYRef.current, keyboardTop);
      });
      setTimeout(() => {
        scrollFocusedInputIntoView(scrollRef.current, contentOffsetYRef.current, keyboardTop);
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
