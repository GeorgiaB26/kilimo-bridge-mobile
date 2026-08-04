import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsNavigator } from './FarmerProjectsNavigator';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerTasksScreen } from '../screens/farmer/FarmerTasksScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import { FarmerFloatingTabBar } from './FarmerFloatingTabBar';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import type { FarmerRootStackParamList, FarmerTabParamList } from './types';

import { FarmerCurrencySync } from '../components/FarmerCurrencySync';

const Tab = createBottomTabNavigator<FarmerTabParamList>();
const RootStack = createNativeStackNavigator<FarmerRootStackParamList>();

function FarmerTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FarmerFloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        sceneStyle: { paddingBottom: 88 },
      }}
    >
      <Tab.Screen name="Dashboard" component={FarmerDashboardScreen} options={{ title: 'Home', headerShown: false }} />
      <Tab.Screen name="Projects" component={FarmerProjectsNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Tasks" component={FarmerTasksScreen} options={{ title: 'Tasks', headerShown: false }} />
      <Tab.Screen name="Payments" component={FarmerPaymentsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={FarmerProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

export function FarmerNavigator() {
  return (
    <>
      <FarmerCurrencySync />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={FarmerTabNavigator} />
        <RootStack.Screen name="MessagesFlow" component={MessagesStackNavigator} />
        <RootStack.Screen name="NotificationsFlow" component={NotificationsStackNavigator} />
      </RootStack.Navigator>
    </>
  );
}
