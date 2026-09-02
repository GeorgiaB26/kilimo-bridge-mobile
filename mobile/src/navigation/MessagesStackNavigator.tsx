import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MessagesScreen } from '../screens/messaging/MessagesScreen';
import { MessageDetailScreen } from '../screens/messaging/MessageDetailScreen';
import { createInboxStackHeaderScreenOptions } from './inboxHeaderOptions';
import type { MessagesStackParamList } from './types';

const Stack = createNativeStackNavigator<MessagesStackParamList>();

export function MessagesStackNavigator() {
  return (
    <Stack.Navigator screenOptions={createInboxStackHeaderScreenOptions()}>
      <Stack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ title: 'Messages' }}
      />
      <Stack.Screen
        name="MessageDetail"
        component={MessageDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
