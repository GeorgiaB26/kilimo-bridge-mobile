import React, { useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  modalKeyboardVerticalOffset,
  useScrollFocusedInputIntoView,
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
  const { width: windowWidth } = useWindowDimensions();
  const isBottom = variant === 'bottom';
  const bottomInset = isBottom ? insets.bottom : 0;
  const defaultSheetClass = isBottom
    ? 'max-h-[92%] rounded-t-2xl bg-white'
    : 'max-h-[85%] rounded-xl bg-white p-5';

  const innerScrollRef = useRef<ScrollView>(null);
  const handleScroll = useScrollFocusedInputIntoView(
    innerScrollRef,
    visible && scrollable,
    scrollViewProps?.onScroll,
  );

  const setScrollRef = (node: ScrollView | null) => {
    innerScrollRef.current = node;
    if (!scrollViewRef) return;
    if (typeof scrollViewRef === 'function') {
      scrollViewRef(node);
    } else {
      (scrollViewRef as React.MutableRefObject<ScrollView | null>).current = node;
    }
  };

  const {
    onScroll: _ignoredOnScroll,
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
      ref={setScrollRef}
      style={[styles.scrollFill, scrollStyle]}
      contentContainerStyle={withBottomInset(contentContainerStyle, scrollBottomInset)}
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
        style={[
          styles.avoiding,
          isBottom ? styles.overlayBottom : styles.overlayCenter,
          avoidingViewStyle,
        ]}
        className={overlayClassName}
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
          style={[
            isBottom ? styles.sheetOuterBottom : styles.sheetOuterCenter,
            { width: windowWidth },
            withBottomInset(sheetStyle, !scrollable && !footer ? bottomInset : 0),
          ]}
        >
          <View
            className={sheetClassName ?? (footer ? undefined : defaultSheetClass)}
            style={styles.sheetInner}
          >
            {header}
            {sheetBody}
          </View>
          {footer ? (
            <View
              collapsable={false}
              style={[
                styles.footerWrap,
                { width: windowWidth },
                bottomInset > 0 ? { paddingBottom: bottomInset } : null,
              ]}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoiding: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  overlayBottom: {
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  overlayCenter: {
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollFill: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  sheetOuterBottom: {
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  sheetOuterCenter: {
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  sheetInner: {
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
  },
  footerWrap: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
  },
});
