import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FarmerProjectsScreen } from '../screens/farmer/FarmerProjectsScreen';
import { FarmerProjectDetailScreen } from '../screens/farmer/FarmerProjectDetailScreen';
import { FarmerHierarchyProjectDetailScreen } from '../screens/farmer/FarmerHierarchyProjectDetailScreen';
import type { FarmerProjectsStackParamList } from './types';
import { farmerStackHeaderScreenOptions } from './farmerHeaderOptions';

const Stack = createNativeStackNavigator<FarmerProjectsStackParamList>();

export function FarmerProjectsNavigator() {
  return (
    <Stack.Navigator screenOptions={farmerStackHeaderScreenOptions}>
      <Stack.Screen name="ProjectsList" component={FarmerProjectsScreen} options={{ title: 'Projects' }} />
      <Stack.Screen
        name="ProjectDetail"
        component={FarmerProjectDetailScreen}
        options={{ title: 'Project Details' }}
      />
      <Stack.Screen
        name="HierarchyProjectDetail"
        component={FarmerHierarchyProjectDetailScreen}
        options={{ title: 'Program project' }}
      />
    </Stack.Navigator>
  );
}
