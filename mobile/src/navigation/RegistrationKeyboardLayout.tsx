import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView as KCAvoidingView } from 'react-native-keyboard-controller';
import { FormKeyboardScroll } from '../components/ui/FormKeyboardScroll';
import {
  PADDING_KEYBOARD_AVOIDING_BEHAVIOR,
  screenKeyboardVerticalOffset,
} from '../utils/keyboardAvoiding';
import { COLORS } from '../constants';

/** Native stack header under status bar — offset for web KeyboardAvoidingView only. */
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

const isWeb = Platform.OS === 'web';

/**
 * Shared shell for multi-step registration forms.
 * Native: KCAvoidingView (padding) + KeyboardAwareScrollView in layout mode.
 * Web: existing RN KeyboardAvoidingView + ScrollView path.
 */
export function RegistrationKeyboardLayout({
  children,
  header,
  scrollable = true,
  contentContainerStyle,
  tabBarCleared = false,
}: Props) {
  const body = scrollable ? (
    <FormKeyboardScroll
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      bottomOffset={24}
    >
      {children}
    </FormKeyboardScroll>
  ) : (
    <View style={styles.flex}>{children}</View>
  );

  const frame = (
    <>
      {header}
      {body}
    </>
  );

  if (isWeb) {
    return (
      <SafeAreaView style={styles.safe} edges={tabBarCleared ? [] : ['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={PADDING_KEYBOARD_AVOIDING_BEHAVIOR}
          keyboardVerticalOffset={screenKeyboardVerticalOffset(REGISTRATION_HEADER_OFFSET)}
        >
          {frame}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={tabBarCleared ? [] : ['bottom']}>
      <KCAvoidingView style={styles.flex} behavior="padding" automaticOffset>
        {frame}
      </KCAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 160 },
});
