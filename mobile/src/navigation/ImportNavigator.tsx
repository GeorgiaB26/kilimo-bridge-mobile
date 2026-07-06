import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CsvUploadScreen } from '../screens/admin/CsvUploadScreen';
import { CsvValidationScreen } from '../screens/admin/CsvValidationScreen';
import { CsvImportScreen } from '../screens/admin/CsvImportScreen';
import { COLORS } from '../constants';
import type { ImportStackParamList } from './types';

const Stack = createNativeStackNavigator<ImportStackParamList>();

export function ImportNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
      }}
    >
      <Stack.Screen name="CsvUpload" component={CsvUploadScreen} options={{ title: 'Import CSV' }} />
      <Stack.Screen name="CsvValidation" component={CsvValidationScreen} options={{ title: 'Validation' }} />
      <Stack.Screen name="CsvImport" component={CsvImportScreen} options={{ title: 'Importing', headerBackVisible: false }} />
    </Stack.Navigator>
  );
}
