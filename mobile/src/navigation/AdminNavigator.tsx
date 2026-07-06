import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { CsvUploadScreen } from '../screens/admin/CsvUploadScreen';
import { CsvValidationScreen } from '../screens/admin/CsvValidationScreen';
import { CsvImportScreen } from '../screens/admin/CsvImportScreen';
import type { AdminStackParamList } from './types';

const Stack = createNativeStackNavigator<AdminStackParamList>();

function withPadding<P extends object>(Screen: React.ComponentType<P>) {
  return function WrappedScreen(props: P) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Screen {...props} />
      </SafeAreaView>
    );
  };
}

export function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        title: 'CSV Import',
      }}
    >
      <Stack.Screen name="CsvUpload" component={withPadding(CsvUploadScreen)} />
      <Stack.Screen name="CsvValidation" component={withPadding(CsvValidationScreen)} options={{ title: 'Validation' }} />
      <Stack.Screen name="CsvImport" component={withPadding(CsvImportScreen)} options={{ title: 'Importing', headerBackVisible: false }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
});
