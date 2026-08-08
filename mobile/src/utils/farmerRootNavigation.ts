import { CommonActions } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { FarmerRootStackParamList } from '../navigation/types';

const FARMER_ROOT_SCREENS: Array<keyof FarmerRootStackParamList> = [
  'MainTabs',
  'MessagesFlow',
  'NotificationsFlow',
  'TaskDetail',
  'CreateTask',
];

function isFarmerRootNavigator(nav: NavigationProp<ParamListBase>): boolean {
  const state = nav.getState();
  if (!state?.routeNames?.length) return false;
  return FARMER_ROOT_SCREENS.every((name) => state.routeNames.includes(name));
}

function findFarmerRootNavigator(
  navigation: NavigationProp<ParamListBase>
): NavigationProp<ParamListBase> | null {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  let fallback: NavigationProp<ParamListBase> | null = null;

  while (nav) {
    const state = nav.getState();
    if (state?.routeNames?.includes('TaskDetail')) {
      if (isFarmerRootNavigator(nav)) return nav;
      fallback = nav;
    }
    nav = nav.getParent();
  }

  return fallback;
}

export function navigateFarmerRootScreen<K extends keyof FarmerRootStackParamList>(
  navigation: NavigationProp<ParamListBase>,
  screen: K,
  params?: FarmerRootStackParamList[K]
): void {
  const farmerRoot = findFarmerRootNavigator(navigation);
  if (farmerRoot) {
    farmerRoot.navigate(screen, params);
    return;
  }

  navigation.dispatch(
    CommonActions.navigate({
      name: screen,
      params,
    })
  );
}
