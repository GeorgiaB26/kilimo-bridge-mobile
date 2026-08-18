import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { AgentFarmerProfileScreen } from '../screens/agent/AgentFarmerProfileScreen';
import { AgentRegisterTypeScreen } from '../screens/agent/AgentRegisterTypeScreen';
import { FieldAgentRegistrationScreen } from '../screens/registration/FieldAgentRegistrationScreen';
import { AgentFarmerRegistrationNavigator } from './AgentFarmerRegistrationNavigator';
import { RegisterNewFarmerButton } from '../components/agent/RegisterNewFarmerButton';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import type { AgentFarmersStackParamList } from './types';

const Stack = createNativeStackNavigator<AgentFarmersStackParamList>();

function withAgentFormLayout<P extends object>(Screen: React.ComponentType<P>) {
  return function WrappedScreen(props: P) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Screen {...props} />
        </ScrollView>
      </SafeAreaView>
    );
  };
}

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
          title: 'Field Agent Platform',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MessagesNotificationsHeaderIcons iconColor="#fff" />
              <RegisterNewFarmerButton
                compact
                onPress={() => navigation.navigate('RegisterPicker')}
              />
            </View>
          ),
        })}
      />
      <Stack.Screen
        name="RegisterPicker"
        component={AgentRegisterTypeScreen}
        options={{ title: 'Register' }}
      />
      <Stack.Screen
        name="RegisterFarmerFlow"
        component={AgentFarmerRegistrationNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RegisterFieldAgent"
        component={withAgentFormLayout(FieldAgentRegistrationScreen as React.ComponentType<object>)}
        options={{ title: 'Register field agent' }}
      />
      <Stack.Screen
        name="FarmerProfile"
        component={AgentFarmerProfileScreen}
        options={({ route }) => ({
          title: route.params.name,
          headerBackTitle: 'Members',
        })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
