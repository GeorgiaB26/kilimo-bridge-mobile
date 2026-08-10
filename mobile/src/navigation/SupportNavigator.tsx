import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { FloatingTabBar, SUPPORT_TAB_ICONS } from './FloatingTabBar';
import { SupportDashboardScreen } from '../screens/support/SupportDashboardScreen';
import { SupportMessagesScreen } from '../screens/support/SupportMessagesScreen';
import { SupportTicketDetailScreen } from '../screens/support/SupportTicketDetailScreen';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import type {
  SupportMessagesStackParamList,
  SupportRootStackParamList,
  SupportTabParamList,
} from './types';

const Tab = createBottomTabNavigator<SupportTabParamList>();
const RootStack = createNativeStackNavigator<SupportRootStackParamList>();
const MessagesStack = createNativeStackNavigator<SupportMessagesStackParamList>();

function SupportMessagesStackNavigator() {
  return (
    <MessagesStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1F4E78' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <MessagesStack.Screen
        name="SupportTicketsList"
        component={SupportMessagesScreen}
        options={{ title: 'Support inbox' }}
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
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={SUPPORT_TAB_ICONS} />}
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Messages' ? false : true,
        headerStyle: { backgroundColor: '#1F4E78' },
        headerTintColor: '#fff',
        headerTitle: 'KB Support',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <MessagesNotificationsHeaderIcons iconColor="#fff" />
          </View>
        ),
        sceneStyle: { paddingBottom: 88 },
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
      <RootStack.Screen name="NotificationsFlow" component={NotificationsStackNavigator} />
    </RootStack.Navigator>
  );
}
