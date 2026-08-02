import React from 'react';
import { Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { RegistrationNavigator } from './RegistrationNavigator';
import type { AgentFarmersStackParamList } from './types';

const Stack = createNativeStackNavigator<AgentFarmersStackParamList>();

export function AgentFarmersStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="FarmerList"
        component={AgentFarmersScreen}
        options={({ navigation }) => ({
          title: 'Farmers',
          headerRight: () => (
            <Pressable
              onPress={() => navigation.navigate('RegisterFarmer')}
              accessibilityLabel="Register new farmer"
              className="mr-1 p-1"
            >
              <Ionicons name="add" size={28} color="#fff" />
            </Pressable>
          ),
        })}
      />
      <Stack.Screen
        name="RegisterFarmer"
        component={RegistrationNavigator}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
