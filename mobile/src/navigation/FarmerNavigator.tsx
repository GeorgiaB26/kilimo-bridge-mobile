import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsScreen } from '../screens/farmer/FarmerProjectsScreen';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import type { FarmerTabParamList } from './types';

import { FarmerCurrencySync } from '../components/FarmerCurrencySync';

const Tab = createBottomTabNavigator<FarmerTabParamList>();

export function FarmerNavigator() {
  return (
    <>
      <FarmerCurrencySync />
      <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: 'home',
            Projects: 'leaf',
            Payments: 'wallet',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={FarmerDashboardScreen} options={{ title: 'Home', headerShown: false }} />
      <Tab.Screen name="Projects" component={FarmerProjectsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Payments" component={FarmerPaymentsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={FarmerProfileScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
    </>
  );
}
