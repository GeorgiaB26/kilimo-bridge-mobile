import React from 'react';
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
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  modalKeyboardVerticalOffset,
} from '../../utils/keyboardAvoiding';

export type KeyboardBottomSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  /** Wrap sheet body in ScrollView with keyboardShouldPersistTaps="handled". */
  scrollable?: boolean;
  scrollViewProps?: ScrollViewProps;
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

  const sheetBody = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollViewProps}
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
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
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
    flex: 1,
  },
});
