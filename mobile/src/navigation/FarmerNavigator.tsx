import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { FarmerDashboardScreen } from '../screens/farmer/FarmerDashboardScreen';
import { FarmerProjectsNavigator } from './FarmerProjectsNavigator';
import { FarmerPaymentsScreen } from '../screens/farmer/FarmerPaymentsScreen';
import { FarmerProfileScreen } from '../screens/farmer/FarmerProfileScreen';
import type { FarmerTabParamList } from './types';
import { FarmerCurrencySync } from '../components/FarmerCurrencySync';
import { useRoleTabBarStyle, roleTabScreenOptions } from './tabBarOptions';

const Tab = createBottomTabNavigator<FarmerTabParamList>();

export function FarmerNavigator() {
  const tabBarStyle = useRoleTabBarStyle();

  return (
    <>
      <FarmerCurrencySync />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          ...roleTabScreenOptions,
          tabBarStyle,
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
        <Tab.Screen name="Projects" component={FarmerProjectsNavigator} options={{ title: 'Projects', headerShown: false }} />
        <Tab.Screen name="Payments" component={FarmerPaymentsScreen} options={{ title: 'Payments', headerShown: false }} />
        <Tab.Screen name="Profile" component={FarmerProfileScreen} options={{ title: 'Profile', headerShown: false }} />
      </Tab.Navigator>
    </>
  );
}
