import { getHeaderTitle } from '@react-navigation/elements';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { AppNavHeader } from './AppNavHeader';

/**
 * Shared farmer top nav — custom header so tab screens and the Projects native
 * stack render the same 46px green bar (native stack ignores headerStyle.height).
 * Status bar inset is handled by AccountSwitcherBar above the navigator.
 */
export { APP_NAV_HEADER_HEIGHT, FARMER_NAV_HEADER_HEIGHT } from './AppNavHeader';

const farmerHeaderBase = {
  headerStatusBarHeight: 0,
  headerShadowVisible: false,
};

/** Bottom-tab screens: Home, Tasks, Payments, Profile. */
export const farmerTabHeaderScreenOptions: BottomTabNavigationOptions = {
  ...farmerHeaderBase,
  header: ({ options, route }) => (
    <AppNavHeader title={getHeaderTitle(options, route.name)} showInboxIcons />
  ),
};

/** Projects stack (list + detail) — same component, back on pushed screens. */
export const farmerStackHeaderScreenOptions: NativeStackNavigationOptions = {
  ...farmerHeaderBase,
  header: ({ options, route, navigation }) => (
    <AppNavHeader
      title={getHeaderTitle(options, route.name)}
      onBack={route.name !== 'ProjectsList' ? () => navigation.goBack() : undefined}
      showInboxIcons={route.name === 'ProjectsList'}
    />
  ),
};
