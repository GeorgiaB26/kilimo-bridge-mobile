import React from 'react';
import { getHeaderTitle } from '@react-navigation/elements';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { AppNavHeader } from './AppNavHeader';
import { RegisterNewFarmerButton } from '../components/agent/RegisterNewFarmerButton';

const AGENT_TAB_TITLE = 'Field Agent';

const agentHeaderBase = {
  headerStatusBarHeight: 0,
  headerShadowVisible: false,
};

/** Bottom-tab screens: Dashboard, Tasks, Activity, Profile. */
export const agentTabHeaderScreenOptions: BottomTabNavigationOptions = {
  ...agentHeaderBase,
  header: () => <AppNavHeader title={AGENT_TAB_TITLE} showInboxIcons />,
};

/** Members stack — list, register flows, farmer profile. */
export const agentFarmersStackHeaderScreenOptions: NativeStackNavigationOptions = {
  ...agentHeaderBase,
  header: ({ options, route, navigation }) => (
    <AppNavHeader
      title={getHeaderTitle(options, route.name)}
      onBack={route.name !== 'FarmerList' ? () => navigation.goBack() : undefined}
      showInboxIcons={route.name === 'FarmerList'}
      rightAccessory={
        route.name === 'FarmerList' ? (
          <RegisterNewFarmerButton
            compact
            onPress={() => navigation.navigate('RegisterPicker')}
          />
        ) : undefined
      }
    />
  ),
};

/** Root stack screens pushed above tabs (e.g. Centres list). */
export const agentRootStackHeaderScreenOptions: NativeStackNavigationOptions = {
  ...agentHeaderBase,
  header: ({ options, route, navigation }) => (
    <AppNavHeader
      title={getHeaderTitle(options, route.name)}
      onBack={() => navigation.goBack()}
      showInboxIcons={false}
    />
  ),
};
