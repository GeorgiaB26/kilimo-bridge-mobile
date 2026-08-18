import React, { useRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  PADDING_KEYBOARD_AVOIDING_BEHAVIOR,
  screenKeyboardVerticalOffset,
  useScrollFocusedInputIntoView,
} from '../utils/keyboardAvoiding';
import { COLORS } from '../constants';

/** Native stack header under status bar — offset for registration KeyboardAvoidingView. */
const REGISTRATION_HEADER_OFFSET = 64;

type Props = {
  children: React.ReactNode;
  /** Optional fixed chrome above the scroll (e.g. StepIndicator). */
  header?: React.ReactNode;
  /** When true, wrap children in ScrollView (most steps). Confirm uses its own scroll. */
  scrollable?: boolean;
  contentContainerStyle?: ViewStyle;
  /**
   * Parent already clears the home indicator + floating tab bar
   * (agent Farmers tab). Skip SafeAreaView bottom padding so it does not
   * stack on that clearance. Public signup (no tab bar) leaves this false.
   */
  tabBarCleared?: boolean;
};

/**
 * Shared shell for multi-step registration forms: bottom safe area + KAV + optional ScrollView.
 * Used by public RegistrationNavigator and agent farmer registration.
 */
export function RegistrationKeyboardLayout({
  children,
  header,
  scrollable = true,
  contentContainerStyle,
  tabBarCleared = false,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const onScroll = useScrollFocusedInputIntoView(scrollRef, scrollable);

  const body = scrollable ? (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView style={styles.safe} edges={tabBarCleared ? [] : ['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={PADDING_KEYBOARD_AVOIDING_BEHAVIOR}
        keyboardVerticalOffset={screenKeyboardVerticalOffset(REGISTRATION_HEADER_OFFSET)}
      >
        {header}
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
