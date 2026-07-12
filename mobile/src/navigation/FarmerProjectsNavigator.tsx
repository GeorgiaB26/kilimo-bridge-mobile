import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { FarmerProjectsScreen } from '../screens/farmer/FarmerProjectsScreen';
import { FarmerProjectDetailScreen } from '../screens/farmer/FarmerProjectDetailScreen';
import type { FarmerProjectsStackParamList } from './types';

const Stack = createNativeStackNavigator<FarmerProjectsStackParamList>();

export function FarmerProjectsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="ProjectsList"
        component={FarmerProjectsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProjectDetail"
        component={FarmerProjectDetailScreen}
        options={{ title: 'Project Details' }}
      />
    </Stack.Navigator>
  );
}
