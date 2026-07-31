import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: 'home',
  Projects: 'leaf',
  Payments: 'wallet',
  Profile: 'person',
};

const HORIZONTAL_MARGIN = 16;
const BOTTOM_MARGIN = 12;
const PILL_RADIUS = 28;
const ICON_HIT = 36;

export function FarmerFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8) + BOTTOM_MARGIN;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.pillShadow}>
        <View style={styles.pillClip}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 55 : 80}
            tint="light"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          {/* Frosted wash so labels stay readable on busy backgrounds */}
          <View style={styles.frostWash} pointerEvents="none" />

          <View style={styles.row}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const { options } = descriptors[route.key];
              const label =
                options.tabBarLabel !== undefined
                  ? String(options.tabBarLabel)
                  : options.title !== undefined
                    ? options.title
                    : route.name;

              const onPress = () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              };

              const onLongPress = () => {
                navigation.emit({
                  type: 'tabLongPress',
                  target: route.key,
                });
              };

              const iconName = TAB_ICONS[route.name] ?? 'ellipse';
              const color = focused ? COLORS.primary : COLORS.muted;

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  style={styles.tab}
                >
                  <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                    <Ionicons name={iconName} size={22} color={focused ? '#fff' : color} />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.label, focused ? styles.labelActive : styles.labelInactive]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: HORIZONTAL_MARGIN,
    right: HORIZONTAL_MARGIN,
    bottom: 0,
  },
  pillShadow: {
    borderRadius: PILL_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
    }),
  },
  pillClip: {
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.72)' : 'transparent',
  },
  frostWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 64,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: ICON_HIT,
    height: ICON_HIT,
    borderRadius: ICON_HIT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: COLORS.primary,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: COLORS.primary,
  },
  labelInactive: {
    color: COLORS.muted,
  },
});
