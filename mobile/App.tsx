import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { COLORS } from './src/constants';
import { HomeScreen } from './src/screens/HomeScreen';
import { RegistrationNavigator } from './src/navigation/RegistrationNavigator';
import { AdminNavigator } from './src/navigation/AdminNavigator';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '600' },
          }}
        >
          <Stack.Screen name="Home" options={{ title: 'Kilimo Bridge' }}>
            {(props) => (
              <SafeAreaView style={styles.home} edges={['bottom']}>
                <HomeScreen navigation={props.navigation} />
              </SafeAreaView>
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Registration"
            component={RegistrationNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Admin"
            component={AdminNavigator}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  home: { flex: 1, padding: 16, backgroundColor: COLORS.background },
});
