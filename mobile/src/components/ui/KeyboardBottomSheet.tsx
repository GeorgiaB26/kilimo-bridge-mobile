import React, { useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { modalKeyboardVerticalOffset } from '../../utils/keyboardAvoiding';

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

  const setScrollRef = (node: ScrollView | null) => {
    innerScrollRef.current = node;
    if (!scrollViewRef) return;
    if (typeof scrollViewRef === 'function') {
      scrollViewRef(node);
    } else {
      (scrollViewRef as React.MutableRefObject<ScrollView | null>).current = node;
    }
  };

  const sheetBody = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      {...scrollViewProps}
      ref={setScrollRef}
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
          {sheetBody}
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
});
