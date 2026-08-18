import { Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';

interface KilimoLogoProps {
  /** Square size. Prefer this for the circular mark. */
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}

export function KilimoLogo({ size = 160, width, height, style }: KilimoLogoProps) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/kilimo-logo.png')}
        style={[{ width: w, height: h, resizeMode: 'contain' }, style]}
        accessibilityLabel="Kilimo Bridge logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
});
