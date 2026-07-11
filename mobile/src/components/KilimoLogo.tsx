import { Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';

interface KilimoLogoProps {
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}

export function KilimoLogo({ width = 220, height = 60, style }: KilimoLogoProps) {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/kilimo-logo.png')}
        style={[{ width, height, resizeMode: 'contain' }, style]}
        accessibilityLabel="Kilimo Bridge logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
});
