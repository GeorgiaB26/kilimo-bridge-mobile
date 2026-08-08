import { CommonActions } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { FarmerRootStackParamList } from '../navigation/types';

function getRootNavigation(
  navigation: NavigationProp<ParamListBase>
): NavigationProp<ParamListBase> {
  let current: NavigationProp<ParamListBase> = navigation;
  let parent = navigation.getParent();
  while (parent) {
    current = parent;
    parent = current.getParent();
  }
  return current;
}

export function navigateFarmerRootScreen<K extends keyof FarmerRootStackParamList>(
  navigation: NavigationProp<ParamListBase>,
  screen: K,
  params?: FarmerRootStackParamList[K]
): void {
  const root = getRootNavigation(navigation);
  root.dispatch(
    CommonActions.navigate({
      name: screen,
      params,
    })
  );
}
