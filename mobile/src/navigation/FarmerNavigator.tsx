import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsNavigator } from './FarmerProjectsNavigator';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import { FarmerFloatingTabBar } from './FarmerFloatingTabBar';
import type { FarmerTabParamList } from './types';

import { FarmerCurrencySync } from '../components/FarmerCurrencySync';

const Tab = createBottomTabNavigator<FarmerTabParamList>();

export function FarmerNavigator() {
  return (
    <>
      <FarmerCurrencySync />
      <Tab.Navigator
        tabBar={(props) => <FarmerFloatingTabBar {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
          // Floating bar overlays the scene so blur can show content behind it.
          // Pad scenes so list/scroll content is not permanently hidden under the pill.
          sceneStyle: { paddingBottom: 88 },
        }}
      >
        <Tab.Screen name="Dashboard" component={FarmerDashboardScreen} options={{ title: 'Home', headerShown: false }} />
        <Tab.Screen name="Projects" component={FarmerProjectsNavigator} options={{ headerShown: false }} />
        <Tab.Screen name="Payments" component={FarmerPaymentsScreen} options={{ headerShown: false }} />
        <Tab.Screen name="Profile" component={FarmerProfileScreen} options={{ headerShown: false }} />
      </Tab.Navigator>
    </>
  );
}
