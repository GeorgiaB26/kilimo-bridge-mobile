import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsNavigator } from './FarmerProjectsNavigator';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerTasksScreen } from '../screens/farmer/FarmerTasksScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import { FarmerTaskDetailScreen } from '../screens/farmer/FarmerTaskDetailScreen';
import { FloatingTabBar, FARMER_TAB_ICONS, useFloatingTabBarSceneStyle } from './FloatingTabBar';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import type { FarmerRootStackParamList, FarmerTabParamList } from './types';
import { farmerTabHeaderScreenOptions } from './farmerHeaderOptions';

import { FarmerCurrencySync } from '../components/FarmerCurrencySync';
import { FarmerTabScene } from './FarmerTabScene';

const Tab = createBottomTabNavigator<FarmerTabParamList>();

function withFarmerTabScene<P extends object>(Component: React.ComponentType<P>) {
  return function FarmerTabScreen(props: P) {
    return (
      <FarmerTabScene>
        <Component {...props} />
      </FarmerTabScene>
    );
  };
}
const RootStack = createNativeStackNavigator<FarmerRootStackParamList>();

function FarmerTabNavigator() {
  const tabSceneStyle = useFloatingTabBarSceneStyle();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={FARMER_TAB_ICONS} />}
      screenOptions={({ route }) => ({
        // Projects renders its own matching header via FarmerProjectsNavigator stack.
        headerShown: route.name !== 'Projects',
        ...farmerTabHeaderScreenOptions,
        sceneStyle: tabSceneStyle,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={withFarmerTabScene(FarmerDashboardScreen)}
        options={{ title: 'Dashboard', tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Projects"
        component={withFarmerTabScene(FarmerProjectsNavigator)}
        options={{ title: 'Projects', tabBarLabel: 'Projects' }}
      />
      <Tab.Screen
        name="Tasks"
        component={withFarmerTabScene(FarmerTasksScreen)}
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen
        name="Payments"
        component={withFarmerTabScene(FarmerPaymentsScreen)}
        options={{ title: 'Payments' }}
      />
      <Tab.Screen
        name="Profile"
        component={withFarmerTabScene(FarmerProfileScreen)}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function FarmerNavigator() {
  return (
    <>
      <FarmerCurrencySync />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs" component={FarmerTabNavigator} />
        <RootStack.Screen name="TaskDetail" component={FarmerTaskDetailScreen} />
        <RootStack.Screen name="MessagesFlow" component={MessagesStackNavigator} />
        <RootStack.Screen name="NotificationsFlow" component={NotificationsStackNavigator} />
      </RootStack.Navigator>
    </>
  );
}
