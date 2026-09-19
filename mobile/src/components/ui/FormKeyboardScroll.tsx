import React, { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

type Props = ScrollViewProps & {
  children: React.ReactNode;
  /** Extra space between the focused field and the keyboard. */
  bottomOffset?: number;
  /** Extra keyboard-sized space at the bottom of the scroller (native only). */
  extraKeyboardSpace?: number;
  /** How KeyboardAwareScrollView creates keyboard room (native only). */
  mode?: KeyboardAwareScrollViewProps['mode'];
};

/**
 * ScrollView on web; KeyboardAwareScrollView on iOS/Android so focused inputs
 * stay above the keyboard. Native uses `mode="layout"` (spacer grows with the
 * keyboard) so last-field scrollTo is not clamped waiting on insets.
 */
export const FormKeyboardScroll = forwardRef<ScrollView, Props>(function FormKeyboardScroll(
  {
    bottomOffset = 24,
    extraKeyboardSpace = 64,
    mode = 'layout',
    children,
    ...props
  },
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
    <KeyboardAwareScrollView
      ref={ref as React.Ref<KeyboardAwareScrollViewRef>}
      {...props}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      mode={mode}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});
