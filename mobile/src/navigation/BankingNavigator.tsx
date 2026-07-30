import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { BankingDashboardScreen } from '../screens/banking/BankingDashboardScreen';
import { BankingPaymentsScreen } from '../screens/banking/BankingPaymentsScreen';
import { RoleProfileScreen } from '../screens/shared/RoleProfileScreen';
import { useRoleTabBarStyle, roleTabScreenOptions } from './tabBarOptions';

const Tab = createBottomTabNavigator();

export function BankingNavigator() {
  const tabBarStyle = useRoleTabBarStyle();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...roleTabScreenOptions,
        tabBarStyle,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Activity: 'list',
            Process: 'send',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Activity" component={BankingDashboardScreen} options={{ title: 'Activity' }} />
      <Tab.Screen name="Process" component={BankingPaymentsScreen} options={{ title: 'Process' }} />
      <Tab.Screen name="Profile" component={RoleProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
