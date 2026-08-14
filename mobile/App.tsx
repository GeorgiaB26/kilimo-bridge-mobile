import 'react-native-reanimated';
import './global.css';

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { PortalHost } from '@rn-primitives/portal';
import { kilimoTheme } from './src/theme/paperTheme';
import { CurrencyProvider } from './src/context/CurrencyContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NativeWindSmokeTest } from './src/components/ui/NativeWindSmokeTest';
import { GlobalOfflineBanner } from './src/components/GlobalOfflineBanner';
import { useOutboxConnectivitySync } from './src/hooks/useOutboxConnectivitySync';

function OutboxConnectivitySync() {
  useOutboxConnectivitySync();
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CurrencyProvider>
        <PaperProvider theme={kilimoTheme}>
          <NavigationContainer>
            <StatusBar style="light" />
            <OutboxConnectivitySync />
            <View style={styles.appShell}>
              <GlobalOfflineBanner />
              <View style={styles.navigator}>
                <RootNavigator />
              </View>
            </View>
            <NativeWindSmokeTest />
            <PortalHost />
          </NavigationContainer>
        </PaperProvider>
      </CurrencyProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  navigator: {
    flex: 1,
  },
});
