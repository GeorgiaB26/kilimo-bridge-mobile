import React from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { COLORS } from '../constants';
import { AgentFarmersScreen } from '../screens/agent/AgentFarmersScreen';
import { AgentFarmerProfileScreen } from '../screens/agent/AgentFarmerProfileScreen';
import { AgentRegisterTypeScreen } from '../screens/agent/AgentRegisterTypeScreen';
import { FieldAgentRegistrationScreen } from '../screens/registration/FieldAgentRegistrationScreen';
import { AgentFarmerRegistrationNavigator } from './AgentFarmerRegistrationNavigator';
import { RegisterNewFarmerButton } from '../components/agent/RegisterNewFarmerButton';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import type { AgentFarmersStackParamList } from './types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

/** Flex header so the title truncates instead of overlapping actions (native-stack web quirk). */
function FarmerListHeader({
  navigation,
}: {
  navigation: NativeStackNavigationProp<AgentFarmersStackParamList, 'FarmerList'>;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.headerBar,
        {
          paddingTop: Platform.OS === 'web' ? 0 : insets.top,
          paddingLeft: Math.max(insets.left, 16),
          paddingRight: Math.max(insets.right, 16),
        },
      ]}
    >
      <View style={styles.headerInner}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Field Agent Platform
        </Text>
        <View style={styles.headerActions}>
          <MessagesNotificationsHeaderIcons iconColor="#fff" />
          <RegisterNewFarmerButton
            compact
            onPress={() => navigation.navigate('RegisterPicker')}
          />
        </View>
      </View>
    </View>
  );
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
          header: () => <FarmerListHeader navigation={navigation} />,
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
          headerBackTitle: 'Farmers',
        })}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  headerBar: {
    backgroundColor: COLORS.primary,
    paddingBottom: 10,
    ...Platform.select({
      web: { paddingTop: 10 },
      default: {},
    }),
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
});
