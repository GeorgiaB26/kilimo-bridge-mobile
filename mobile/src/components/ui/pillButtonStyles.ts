import { StyleSheet, type ViewStyle, type TextStyle } from 'react-native';

/**
 * Shared pill CTA shape used on farmer home and field-agent screens.
 * Apply colour overrides per button; keep layout from these base styles.
 */
export const pillButtonBase: ViewStyle = {
  minHeight: 44,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingHorizontal: 14,
  paddingVertical: 11,
  borderRadius: 999,
  borderWidth: 1,
};

export const pillButtonTextBase: TextStyle = {
  fontWeight: '600',
  fontSize: 14,
  textAlign: 'center',
};

export const pillButtonStyles = StyleSheet.create({
  base: pillButtonBase,
  text: pillButtonTextBase,
  fullWidth: {
    width: '100%',
  },
});
