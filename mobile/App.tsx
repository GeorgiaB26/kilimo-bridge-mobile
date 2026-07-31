import 'react-native-reanimated';
import './global.css';

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { PortalHost } from '@rn-primitives/portal';
import { kilimoTheme } from './src/theme/paperTheme';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NativeWindSmokeTest } from './src/components/ui/NativeWindSmokeTest';

export default function App() {
  return (
    <SafeAreaProvider>
      <CurrencyProvider>
        <PaperProvider theme={kilimoTheme}>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
            <NativeWindSmokeTest />
            <PortalHost />
          </NavigationContainer>
        </PaperProvider>
      </CurrencyProvider>
    </SafeAreaProvider>
  );
}
