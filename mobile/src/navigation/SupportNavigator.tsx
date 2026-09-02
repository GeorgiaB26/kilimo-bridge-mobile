import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FloatingTabBar, SUPPORT_TAB_ICONS, floatingTabBarNavigatorScreenOptions, useFloatingTabBarSceneStyle } from './FloatingTabBar';
import { SupportDashboardScreen } from '../screens/support/SupportDashboardScreen';
import { SupportMessagesScreen } from '../screens/support/SupportMessagesScreen';
import { SupportTicketDetailScreen } from '../screens/support/SupportTicketDetailScreen';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { SupportHeaderIcons, SUPPORT_BLUE } from './SupportHeaderIcons';
import type {
  SupportMessagesStackParamList,
  SupportRootStackParamList,
  SupportTabParamList,
} from './types';

const Tab = createBottomTabNavigator<SupportTabParamList>();
const RootStack = createNativeStackNavigator<SupportRootStackParamList>();
const MessagesStack = createNativeStackNavigator<SupportMessagesStackParamList>();

function SupportNotificationsStack() {
  return <NotificationsStackNavigator headerColor={SUPPORT_BLUE} />;
}

function SupportMessagesStackNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: SUPPORT_BLUE },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <MessagesStack.Screen
        name="SupportTicketsList"
        component={SupportMessagesScreen}
        options={{
          title: 'Support inbox',
          headerRight: () => <SupportHeaderIcons />,
        }}
      />
      <MessagesStack.Screen
        name="SupportTicketDetail"
        component={SupportTicketDetailScreen}
        options={{ headerShown: false }}
      />
    </MessagesStack.Navigator>
  );
}

function SupportTabNavigator() {
  const tabSceneStyle = useFloatingTabBarSceneStyle();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={SUPPORT_TAB_ICONS} />}
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Messages' ? false : true,
        headerStyle: { backgroundColor: SUPPORT_BLUE },
        headerTintColor: '#fff',
        headerTitle: 'KB Support',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <SupportHeaderIcons />,
        ...floatingTabBarNavigatorScreenOptions,
        sceneStyle: tabSceneStyle,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={SupportDashboardScreen}
        options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="Messages"
        component={SupportMessagesStackNavigator}
        options={{ title: 'Messages', tabBarLabel: 'Messages' }}
      />
    </Tab.Navigator>
  );
}

export function SupportNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={SupportTabNavigator} />
      <RootStack.Screen name="NotificationsFlow" component={SupportNotificationsStack} />
    </RootStack.Navigator>
  );
}
