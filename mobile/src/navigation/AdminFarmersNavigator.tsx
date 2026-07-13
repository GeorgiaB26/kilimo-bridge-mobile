import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { AdminFarmersScreen } from '../screens/admin/AdminFarmersScreen';
import { AdminFarmerDetailScreen } from '../screens/admin/AdminFarmerDetailScreen';
import type { AdminFarmersStackParamList } from './types';

const Stack = createNativeStackNavigator<AdminFarmersStackParamList>();

export function AdminFarmersNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="FarmersList"
        component={AdminFarmersScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FarmerDetail"
        component={AdminFarmerDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
