import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { AgentDashboardScreen } from '../screens/agent/AgentDashboardScreen';
import { AgentTasksScreen } from '../screens/agent/AgentTasksScreen';
import { AgentFarmersStackNavigator } from './AgentFarmersStackNavigator';
import { AgentAuditScreen } from '../screens/agent/AgentAuditScreen';
import { AgentProfileScreen } from '../screens/agent/AgentProfileScreen';
import type { AgentTabParamList } from './types';

const Tab = createBottomTabNavigator<AgentTabParamList>();

const HEADER_TITLE = 'Field Agent Platform';

export function AgentNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Farmers' ? false : true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitle: HEADER_TITLE,
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
      <Tab.Screen name="Dashboard" component={AgentDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen
        name="Farmers"
        component={AgentFarmersStackNavigator}
        options={{ headerShown: false, title: 'Farmers' }}
      />
      <Tab.Screen name="Tasks" component={AgentTasksScreen} options={{ title: 'Tasks' }} />
      <Tab.Screen name="Audit" component={AgentAuditScreen} options={{ title: 'Activity Log' }} />
      <Tab.Screen name="Profile" component={AgentProfileScreen} options={{ title: 'Profile', headerShown: false }} />
    </Tab.Navigator>
  );
}
