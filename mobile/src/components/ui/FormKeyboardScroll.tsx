import React, { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

type Props = ScrollViewProps & {
  children: React.ReactNode;
  /** Extra space between the focused field and the keyboard. */
  bottomOffset?: number;
};

/**
 * ScrollView on web; KeyboardAwareScrollView on iOS/Android so focused inputs
 * stay above the keyboard without RN KeyboardAvoidingView measurement hacks.
 */
export const FormKeyboardScroll = forwardRef<ScrollView, Props>(function FormKeyboardScroll(
  { bottomOffset = 24, children, ...props },
  ref,
) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView ref={ref} {...props}>
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} {...props}>
      {children}
    </KeyboardAwareScrollView>
  );
});
