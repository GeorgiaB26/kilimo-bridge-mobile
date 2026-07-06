import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { BankingDashboardScreen } from '../screens/banking/BankingDashboardScreen';
import { BankingPaymentsScreen } from '../screens/banking/BankingPaymentsScreen';
import { AdminProfileScreen } from '../screens/admin/AdminProfileScreen';

const Tab = createBottomTabNavigator();

export function BankingNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        tabBarActiveTintColor: COLORS.primary,
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Transactions: 'card', Process: 'send', Settings: 'settings',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Transactions" component={BankingDashboardScreen} />
      <Tab.Screen name="Process" component={BankingPaymentsScreen} options={{ title: 'Process M-Pesa' }} />
      <Tab.Screen name="Settings" component={AdminProfileScreen} />
    </Tab.Navigator>
  );
}
