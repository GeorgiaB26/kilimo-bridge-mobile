import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { kilimoTheme } from './src/theme/paperTheme';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <CurrencyProvider>
        <PaperProvider theme={kilimoTheme}>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </PaperProvider>
      </CurrencyProvider>
    </SafeAreaProvider>
  );
}
