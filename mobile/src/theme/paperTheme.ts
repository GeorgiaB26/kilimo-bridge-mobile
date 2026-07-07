import { MD3LightTheme, configureFonts } from 'react-native-paper';
import { COLORS } from '../constants';

const fontConfig = {
  fontFamily: 'System',
};

export const kilimoTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: COLORS.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: '#E8F5E9',
    secondary: COLORS.accent,
    onSecondary: COLORS.text,
    secondaryContainer: '#FFF8E1',
    background: COLORS.background,
    surface: COLORS.surface,
    surfaceVariant: COLORS.cardBg,
    error: COLORS.alert,
    onSurface: COLORS.text,
    outline: COLORS.border,
  },
  roundness: 12,
  fonts: configureFonts({ config: fontConfig }),
};
