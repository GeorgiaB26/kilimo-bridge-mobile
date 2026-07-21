import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { AdminProgramProjectsScreen } from '../screens/admin/AdminProgramProjectsScreen';
import { AdminProgramProjectDetailScreen } from '../screens/admin/AdminProgramProjectDetailScreen';
import { AdminPendingTasksScreen } from '../screens/admin/AdminPendingTasksScreen';
import type { AdminProgramsStackParamList } from './types';

const Stack = createNativeStackNavigator<AdminProgramsStackParamList>();

export function AdminProgramsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="ProgramProjectsList" component={AdminProgramProjectsScreen} options={{ title: 'Programs' }} />
      <Stack.Screen
        name="ProgramProjectDetail"
        component={AdminProgramProjectDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
      <Stack.Screen name="PendingTasks" component={AdminPendingTasksScreen} options={{ title: 'Pending approvals' }} />
    </Stack.Navigator>
  );
}
