import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { AgentDashboardScreen } from '../screens/agent/AgentDashboardScreen';
import { AgentTasksScreen } from '../screens/agent/AgentTasksScreen';
import { AgentFarmersStackNavigator } from './AgentFarmersStackNavigator';
import { AgentAuditScreen } from '../screens/agent/AgentAuditScreen';
import { AgentProfileScreen } from '../screens/agent/AgentProfileScreen';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import { AgentTabScene } from './AgentTabScene';
import type { AgentRootStackParamList, AgentTabParamList } from './types';

const Tab = createBottomTabNavigator<AgentTabParamList>();
const RootStack = createNativeStackNavigator<AgentRootStackParamList>();

const HEADER_TITLE = 'Field Agent Platform';

function withAgentTabScene<P extends object>(Component: React.ComponentType<P>) {
  return function Wrapped(props: P) {
    return (
      <AgentTabScene>
        <Component {...props} />
      </AgentTabScene>
    );
  };
}

function AgentTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Farmers' || route.name === 'Profile' ? false : true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitle: HEADER_TITLE,
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <MessagesNotificationsHeaderIcons iconColor="#fff" />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'stats-chart',
            Farmers: 'people',
            Tasks: 'checkmark-circle',
            Audit: 'list',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={withAgentTabScene(AgentDashboardScreen)}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Farmers"
        component={withAgentTabScene(AgentFarmersStackNavigator)}
        options={{ title: 'Farmers' }}
      />
      <Tab.Screen
        name="Tasks"
        component={withAgentTabScene(AgentTasksScreen)}
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen
        name="Audit"
        component={withAgentTabScene(AgentAuditScreen)}
        options={{ title: 'Activity Log' }}
      />
      <Tab.Screen
        name="Profile"
        component={withAgentTabScene(AgentProfileScreen)}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function AgentNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={AgentTabNavigator} />
      <RootStack.Screen name="MessagesFlow" component={MessagesStackNavigator} />
      <RootStack.Screen name="NotificationsFlow" component={NotificationsStackNavigator} />
    </RootStack.Navigator>
  );
}
