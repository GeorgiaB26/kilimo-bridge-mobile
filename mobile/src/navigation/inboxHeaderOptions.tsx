import { getHeaderTitle } from '@react-navigation/elements';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { AppNavHeader } from './AppNavHeader';

const inboxHeaderBase = {
  headerStatusBarHeight: 0,
  headerShadowVisible: false,
};

/** Messages / notifications stacks — same 46px bar as main tabs. */
export function createInboxStackHeaderScreenOptions(
  headerColor: string = COLORS.primary,
): NativeStackNavigationOptions {
  return {
    ...inboxHeaderBase,
    header: ({ options, route, navigation }) => (
      <AppNavHeader
        title={getHeaderTitle(options, route.name)}
        onBack={() => navigation.goBack()}
        showInboxIcons={false}
        backgroundColor={headerColor}
      />
    ),
  };
}
