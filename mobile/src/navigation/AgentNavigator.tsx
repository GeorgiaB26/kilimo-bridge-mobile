import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AggregationCentreDashboardScreen } from '../screens/aggregation/AggregationCentreDashboardScreen';
import { AgentPendingTasksScreen } from '../screens/agent/AgentPendingTasksScreen';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { RegistrationNavigator } from './RegistrationNavigator';
import { RoleProfileScreen } from '../screens/shared/RoleProfileScreen';
import { useRoleTabBarStyle, roleTabScreenOptions } from './tabBarOptions';

const Tab = createBottomTabNavigator();

export function AgentNavigator() {
  const tabBarStyle = useRoleTabBarStyle();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...roleTabScreenOptions,
        headerShown: route.name === 'Register' ? false : true,
        tabBarStyle,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Farmers: 'people',
            Tasks: 'checkmark-circle',
            Register: 'person-add',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={AggregationCentreDashboardScreen} options={{ title: 'Field Agent' }} />
      <Tab.Screen name="Farmers" component={AgentFarmersScreen} />
      <Tab.Screen name="Tasks" component={AgentPendingTasksScreen} options={{ title: 'Approvals' }} />
      <Tab.Screen name="Register" component={RegistrationNavigator} options={{ title: 'Register' }} />
      <Tab.Screen name="Profile" component={RoleProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
