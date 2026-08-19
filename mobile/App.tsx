import 'react-native-reanimated';
import './global.css';

import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { PortalHost } from '@rn-primitives/portal';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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

function AppTree() {
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

export default function App() {
  if (Platform.OS === 'web') {
    return <AppTree />;
  }
  return (
    <KeyboardProvider preload={false}>
      <AppTree />
    </KeyboardProvider>
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
