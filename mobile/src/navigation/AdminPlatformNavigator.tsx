import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminFarmersScreen } from '../screens/admin/AdminFarmersScreen';
import { AdminUsersScreen } from '../screens/admin/AdminUsersScreen';
import { AdminProfileScreen } from '../screens/admin/AdminProfileScreen';
import { ImportNavigator } from './ImportNavigator';
import { RegistrationNavigator } from './RegistrationNavigator';
import type { AdminTabParamList } from './types';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminPlatformNavigator() {
  const role = useAuthStore((s) => s.user?.role);
  const canImport = role === 'super_admin' || role === 'admin';
  const canManageUsers = role === 'super_admin' || role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'grid',
            Farmers: 'people',
            Import: 'cloud-upload',
            Register: 'person-add',
            Users: 'shield',
            Profile: 'settings',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff', title: 'Dashboard' }} />
      <Tab.Screen name="Farmers" component={AdminFarmersScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff', title: 'Farmers' }} />
      {canImport ? (
        <Tab.Screen name="Import" component={ImportNavigator} options={{ title: 'Import' }} />
      ) : null}
      <Tab.Screen name="Register" component={RegistrationNavigator} options={{ title: 'Register' }} />
      {canManageUsers ? (
        <Tab.Screen name="Users" component={AdminUsersScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff', title: 'Users' }} />
      ) : null}
      <Tab.Screen name="Profile" component={AdminProfileScreen} options={{ headerShown: true, headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: '#fff', title: 'Settings' }} />
    </Tab.Navigator>
  );
}
