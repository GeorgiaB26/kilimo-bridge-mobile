import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsNavigator } from './FarmerProjectsNavigator';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerTasksScreen } from '../screens/farmer/FarmerTasksScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import { FarmerTaskDetailScreen } from '../screens/farmer/FarmerTaskDetailScreen';
import { FloatingTabBar, FARMER_TAB_ICONS, useFloatingTabBarSceneStyle } from './FloatingTabBar';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import type { FarmerRootStackParamList, FarmerTabParamList } from './types';

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

function HeaderInboxIcons() {
  return (
    <View style={styles.headerRight}>
      <MessagesNotificationsHeaderIcons iconColor="#fff" />
    </View>
  );
}

function FarmerTabNavigator() {
  const tabSceneStyle = useFloatingTabBarSceneStyle();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={FARMER_TAB_ICONS} />}
      screenOptions={({ route }) => ({
        // Projects uses its own stack headers (list + detail) — same green bar size.
        headerShown: route.name !== 'Projects',
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <HeaderInboxIcons />,
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

const styles = StyleSheet.create({
  headerRight: {
    marginRight: 16,
  },
});
