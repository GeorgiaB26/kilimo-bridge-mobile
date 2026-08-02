import React from 'react';
import { Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { AgentFarmerProfileScreen } from '../screens/agent/AgentFarmerProfileScreen';
import { RegistrationNavigator } from './RegistrationNavigator';
import { RegisterNewFarmerButton } from '../components/agent/RegisterNewFarmerButton';
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
            <RegisterNewFarmerButton
              compact
              onPress={() => navigation.navigate('RegisterFarmer')}
            />
          ),
        })}
      />
      <Stack.Screen
        name="RegisterFarmer"
        component={RegistrationNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FarmerProfile"
        component={AgentFarmerProfileScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </Stack.Navigator>
  );
}
