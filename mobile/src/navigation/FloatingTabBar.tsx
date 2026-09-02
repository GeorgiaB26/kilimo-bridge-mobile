import React, { useContext, useLayoutEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';

export type FloatingTabIconMap = Record<string, keyof typeof Ionicons.glyphMap>;

export const FARMER_TAB_ICONS: FloatingTabIconMap = {
  Dashboard: 'home',
  Projects: 'leaf',
  Tasks: 'checkbox',
  Payments: 'wallet',
  Profile: 'person',
};

export const AGENT_TAB_ICONS: FloatingTabIconMap = {
  Dashboard: 'stats-chart',
  Farmers: 'people',
  Tasks: 'checkmark-circle',
  Audit: 'list',
  Profile: 'person',
};

export const SUPPORT_TAB_ICONS: FloatingTabIconMap = {
  Dashboard: 'stats-chart',
  Messages: 'chatbubbles',
};

const HORIZONTAL_MARGIN = 16;
const BOTTOM_MARGIN = 12;
/** Matches `styles.row.minHeight` — keep in sync with the pill layout below. */
const PILL_MIN_HEIGHT = 56;
/** Extra space above the pill so content is not flush against the blur. */
const SCENE_CLEARANCE_GAP = 12;
/** Large enough that ends are full semicircles regardless of bar height (stadium pill). */
const PILL_RADIUS = 999;
const ICON_HIT = 28;
const ICON_SIZE = 18;
const PILL_BORDER_COLOR = 'rgba(0, 0, 0, 0.2)';

function TabBarIcon({
  focused,
  iconName,
  color,
}: {
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  const radius = ICON_HIT / 2;

  return (
    <View style={styles.iconSlot} collapsable={false}>
      {focused ? (
        <Svg
          width={ICON_HIT}
          height={ICON_HIT}
          style={styles.activeCircle}
          pointerEvents="none"
        >
          <Circle cx={radius} cy={radius} r={radius} fill={COLORS.primary} />
        </Svg>
      ) : null}
      <Ionicons
        name={iconName}
        size={ICON_SIZE}
        color={focused ? '#fff' : color}
        style={styles.iconGlyph}
      />
    </View>
  );
}

/**
 * Vertical space consumed by the absolute FloatingTabBar (safe-area + margin + pill).
 * Use for tab `sceneStyle.paddingBottom` so scroll content clears the bar.
 */
export function floatingTabBarClearance(bottomInset: number): number {
  const bottomPad = Math.max(bottomInset, 8) + BOTTOM_MARGIN;
  return bottomPad + PILL_MIN_HEIGHT + SCENE_CLEARANCE_GAP;
}

/** Use on Tab.Navigator screenOptions so only the pill is painted — no grey tab bar strip. */
export const floatingTabBarNavigatorScreenOptions = {
  tabBarStyle: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    height: 0,
  },
};

/**
 * Tab scenes extend edge-to-edge behind the floating pill.
 * Apply `floatingTabBarClearance()` to scroll content padding instead.
 */
export function useFloatingTabBarSceneStyle(): ViewStyle {
  return useMemo(() => ({}), []);
}

type Props = BottomTabBarProps & {
  icons?: FloatingTabIconMap;
};

export function FloatingTabBar({ state, descriptors, navigation, icons = FARMER_TAB_ICONS }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8) + BOTTOM_MARGIN;
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);

  useLayoutEffect(() => {
    onTabBarHeightChange?.(0);
  }, [onTabBarHeightChange]);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.pillShadow}>
        <View style={styles.pillClip}>
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

              const iconName = icons[route.name] ?? 'ellipse';
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
                  <TabBarIcon focused={focused} iconName={iconName} color={color} />
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
    zIndex: 1000,
    elevation: 1000,
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
    borderWidth: 1.5,
    borderColor: PILL_BORDER_COLOR,
    backgroundColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: PILL_MIN_HEIGHT,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'visible',
  },
  iconSlot: {
    width: ICON_HIT,
    height: ICON_HIT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  activeCircle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  iconGlyph: {
    zIndex: 1,
  },
  label: {
    fontSize: 10,
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
