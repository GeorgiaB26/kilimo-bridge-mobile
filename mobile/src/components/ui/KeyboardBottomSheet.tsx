import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  modalKeyboardVerticalOffset,
  scrollFocusedInputIntoView,
  SHEET_SCROLL_INTO_VIEW_DELAY_MS,
} from '../../utils/keyboardAvoiding';

/**
 * Bottom-sheet KAV: `padding` on both platforms.
 * Android `height` plus `adjustResize` shrinks the overlay; a flex backdrop then
 * eats the remaining space instead of lifting the sheet.
 */
export const SHEET_KEYBOARD_AVOIDING_BEHAVIOR = 'padding' as const;

export type KeyboardBottomSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** Wrap sheet body in ScrollView with keyboardShouldPersistTaps="handled". */
  scrollable?: boolean;
  scrollViewProps?: ScrollViewProps;
  scrollViewRef?: React.Ref<ScrollView>;
  /** Fixed chrome above the scroll body (title bar). Does not scroll. */
  header?: React.ReactNode;
  /** Fixed chrome below the scroll body (actions). Does not scroll. */
  footer?: React.ReactNode;
  /** Bottom-aligned sheet (default) or centered dialog. */
  variant?: 'bottom' | 'center';
  /** Tap dimmed backdrop to dismiss (default true). */
  dismissOnBackdropPress?: boolean;
  backdropPressDisabled?: boolean;
  sheetClassName?: string;
  sheetStyle?: StyleProp<ViewStyle>;
  overlayClassName?: string;
  avoidingViewStyle?: StyleProp<ViewStyle>;
  animationType?: 'none' | 'slide' | 'fade';
};

const webBackdropCursor =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

export function KeyboardBottomSheet({
  visible,
  onRequestClose,
  children,
  scrollable = false,
  scrollViewProps,
  scrollViewRef,
  header,
  footer,
  variant = 'bottom',
  dismissOnBackdropPress = true,
  backdropPressDisabled = false,
  sheetClassName,
  sheetStyle,
  overlayClassName,
  avoidingViewStyle,
  animationType = 'none',
}: KeyboardBottomSheetProps) {
  const isBottom = variant === 'bottom';
  const defaultOverlayClass = isBottom
    ? 'flex-1 justify-end bg-black/40'
    : 'flex-1 justify-center bg-black/45 p-4';
  const defaultSheetClass = isBottom
    ? 'max-h-[92%] rounded-t-2xl bg-white'
    : 'max-h-[85%] rounded-xl bg-white p-5';

  const innerScrollRef = useRef<ScrollView>(null);
  const contentOffsetYRef = useRef(0);

  const setScrollRef = (node: ScrollView | null) => {
    innerScrollRef.current = node;
    if (!scrollViewRef) return;
    if (typeof scrollViewRef === 'function') {
      scrollViewRef(node);
    } else {
      (scrollViewRef as React.MutableRefObject<ScrollView | null>).current = node;
    }
  };

  useEffect(() => {
    if (!visible || !scrollable || Platform.OS === 'web') return;

    const run = () => {
      requestAnimationFrame(() => {
        scrollFocusedInputIntoView(innerScrollRef.current, contentOffsetYRef.current);
      });
      setTimeout(() => {
        scrollFocusedInputIntoView(innerScrollRef.current, contentOffsetYRef.current);
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
  }, [visible, scrollable]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    contentOffsetYRef.current = e.nativeEvent.contentOffset.y;
    scrollViewProps?.onScroll?.(e);
  };

  const {
    onScroll: _ignoredOnScroll,
    style: scrollStyle,
    contentContainerStyle,
    ...restScrollViewProps
  } = scrollViewProps ?? {};

  const sheetBody = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      scrollEventThrottle={16}
      {...restScrollViewProps}
      ref={setScrollRef}
      style={[styles.scrollFill, scrollStyle]}
      contentContainerStyle={contentContainerStyle}
      onScroll={handleScroll}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={[styles.avoiding, avoidingViewStyle]}
        className={overlayClassName ?? defaultOverlayClass}
        behavior={SHEET_KEYBOARD_AVOIDING_BEHAVIOR}
        keyboardVerticalOffset={modalKeyboardVerticalOffset()}
      >
        {dismissOnBackdropPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onRequestClose}
            disabled={backdropPressDisabled}
            style={[styles.backdrop, webBackdropCursor]}
          />
        ) : null}
        <View
          className={sheetClassName ?? defaultSheetClass}
          style={sheetStyle}
        >
          {header}
          {sheetBody}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoiding: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollFill: {
    flexShrink: 1,
  },
});
