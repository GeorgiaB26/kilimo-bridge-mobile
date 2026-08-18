import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants';
import { AgentDashboardScreen } from '../screens/agent/AgentDashboardScreen';
import { AgentTasksScreen } from '../screens/agent/AgentTasksScreen';
import { AgentFarmersStackNavigator } from './AgentFarmersStackNavigator';
import { AgentAuditScreen } from '../screens/agent/AgentAuditScreen';
import { AgentProfileScreen } from '../screens/agent/AgentProfileScreen';
import { AgentCentresScreen } from '../screens/agent/AgentCentresScreen';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { MessagesNotificationsHeaderIcons } from '../components/messaging/MessagesNotificationsHeaderIcons';
import { AgentTabScene } from './AgentTabScene';
import { FloatingTabBar, AGENT_TAB_ICONS, useFloatingTabBarSceneStyle } from './FloatingTabBar';
import type { AgentRootStackParamList, AgentTabParamList } from './types';

const Tab = createBottomTabNavigator<AgentTabParamList>();
const RootStack = createNativeStackNavigator<AgentRootStackParamList>();

const HEADER_TITLE = 'Field Agent';

function withAgentTabScene<P extends object>(Component: React.ComponentType<P>) {
  return function Wrapped(props: P) {
    return (
      <AgentTabScene>
        <Component {...props} />
      </AgentTabScene>
    );
  };
}

function AgentTabNavigator() {
  const tabSceneStyle = useFloatingTabBarSceneStyle();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} icons={AGENT_TAB_ICONS} />}
      screenOptions={({ route }) => ({
        headerShown: route.name === 'Farmers' ? false : true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitle: HEADER_TITLE,
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <MessagesNotificationsHeaderIcons iconColor="#fff" />
          </View>
        ),
        sceneStyle: tabSceneStyle,
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={withAgentTabScene(AgentDashboardScreen)}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen
        name="Farmers"
        component={withAgentTabScene(AgentFarmersStackNavigator)}
        options={{ title: 'Members' }}
      />
      <Tab.Screen
        name="Tasks"
        component={withAgentTabScene(AgentTasksScreen)}
        options={{ title: 'Tasks' }}
      />
      <Tab.Screen
        name="Audit"
        component={withAgentTabScene(AgentAuditScreen)}
        options={{ title: 'Activity Log', tabBarLabel: 'Activity' }}
      />
      <Tab.Screen
        name="Profile"
        component={withAgentTabScene(AgentProfileScreen)}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export function AgentNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainTabs" component={AgentTabNavigator} />
      <RootStack.Screen name="MessagesFlow" component={MessagesStackNavigator} />
      <RootStack.Screen name="NotificationsFlow" component={NotificationsStackNavigator} />
      <RootStack.Screen
        name="CentresList"
        component={AgentCentresScreen}
        options={{
          headerShown: true,
          title: 'Centres in my district',
          headerStyle: { backgroundColor: COLORS.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </RootStack.Navigator>
  );
}
