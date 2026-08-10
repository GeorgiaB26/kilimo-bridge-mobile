import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { NotificationsScreen } from '../screens/messaging/NotificationsScreen';
import { NotificationSettingsScreen } from '../screens/messaging/NotificationSettingsScreen';
import type { NotificationsStackParamList } from './types';

const Stack = createNativeStackNavigator<NotificationsStackParamList>();

type Props = {
  /** Header background — Support desk uses blue; farmer/agent keep green primary. */
  headerColor?: string;
};

export function NotificationsStackNavigator({ headerColor = COLORS.primary }: Props) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: headerColor },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="NotificationsList"
        component={NotificationsScreen}
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{ title: 'Notification Settings' }}
      />
    </Stack.Navigator>
  );
}
