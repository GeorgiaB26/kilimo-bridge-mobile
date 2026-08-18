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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyboardAvoidingView as KCAvoidingView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { modalKeyboardVerticalOffset } from '../../utils/keyboardAvoiding';

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

const isWeb = Platform.OS === 'web';

const webBackdropCursor =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

function withBottomInset(
  style: StyleProp<ViewStyle> | undefined,
  extra: number,
): StyleProp<ViewStyle> {
  if (extra <= 0) return style;
  const flat = StyleSheet.flatten(style);
  const current =
    typeof flat?.paddingBottom === 'number'
      ? flat.paddingBottom
      : typeof flat?.padding === 'number'
        ? flat.padding
        : 0;
  return [style, { paddingBottom: current + extra }];
}

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
  const insets = useSafeAreaInsets();
  const isBottom = variant === 'bottom';
  const bottomInset = isBottom ? insets.bottom : 0;
  const defaultOverlayClass = isBottom
    ? 'flex-1 justify-end bg-black/40'
    : 'flex-1 justify-center bg-black/45 p-4';
  const defaultSheetClass = isBottom
    ? 'max-h-[92%] rounded-t-2xl bg-white'
    : 'max-h-[85%] rounded-xl bg-white p-5';

  const {
    onScroll: onScrollProp,
    style: scrollStyle,
    contentContainerStyle,
    ...restScrollViewProps
  } = scrollViewProps ?? {};

  /** Footer already clears the nav bar — don't double-pad the scroller. */
  const scrollBottomInset = footer ? 0 : bottomInset;

  const sheetBody = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      scrollEventThrottle={16}
      {...restScrollViewProps}
      ref={scrollViewRef}
      style={[styles.scrollFill, scrollStyle]}
      contentContainerStyle={withBottomInset(contentContainerStyle, scrollBottomInset)}
      onScroll={onScrollProp}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  const footerNode = footer ? (
    isWeb ? (
      <View style={[styles.footerWrap, bottomInset > 0 ? { paddingBottom: bottomInset } : null]}>
        {footer}
      </View>
    ) : (
      <KeyboardStickyView style={styles.footerWrap}>
        <View style={[styles.footerWrap, bottomInset > 0 ? { paddingBottom: bottomInset } : null]}>
          {footer}
        </View>
      </KeyboardStickyView>
    )
  ) : null;

  const overlay = (
    <>
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
        style={[
          isBottom ? styles.sheetStretch : null,
          withBottomInset(sheetStyle, !scrollable && !footer ? bottomInset : 0),
        ]}
      >
        {header}
        {sheetBody}
        {footerNode}
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      {isWeb ? (
        <KeyboardAvoidingView
          style={[styles.avoiding, avoidingViewStyle]}
          className={overlayClassName ?? defaultOverlayClass}
          behavior={SHEET_KEYBOARD_AVOIDING_BEHAVIOR}
          keyboardVerticalOffset={modalKeyboardVerticalOffset()}
        >
          {overlay}
        </KeyboardAvoidingView>
      ) : (
        <KCAvoidingView
          style={[styles.avoiding, avoidingViewStyle]}
          className={overlayClassName ?? defaultOverlayClass}
          behavior="padding"
          automaticOffset
        >
          {overlay}
        </KCAvoidingView>
      )}
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
  sheetStretch: {
    width: '100%',
    alignSelf: 'stretch',
  },
  footerWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
