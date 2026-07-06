import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { AgentAuditScreen } from '../screens/agent/AgentAuditScreen';
import { RegistrationNavigator } from './RegistrationNavigator';
import { AdminProfileScreen } from '../screens/admin/AdminProfileScreen';

const Tab = createBottomTabNavigator();

export function AgentNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Register' ? false : true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        tabBarActiveTintColor: COLORS.primary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'grid', Farmers: 'people', Register: 'person-add',
            Audit: 'list', Settings: 'settings',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Farmers" component={AgentFarmersScreen} />
      <Tab.Screen name="Register" component={RegistrationNavigator} options={{ title: 'Register' }} />
      <Tab.Screen name="Audit" component={AgentAuditScreen} options={{ title: 'Activity Log' }} />
      <Tab.Screen name="Settings" component={AdminProfileScreen} />
    </Tab.Navigator>
  );
}
