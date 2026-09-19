import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AgentDashboardScreen } from '../screens/agent/AgentDashboardScreen';
import { AgentTasksScreen } from '../screens/agent/AgentTasksScreen';
import { AgentFarmersStackNavigator } from './AgentFarmersStackNavigator';
import { AgentAuditScreen } from '../screens/agent/AgentAuditScreen';
import { AgentProfileScreen } from '../screens/agent/AgentProfileScreen';
import { AgentCentresScreen } from '../screens/agent/AgentCentresScreen';
import { MessagesStackNavigator } from './MessagesStackNavigator';
import { NotificationsStackNavigator } from './NotificationsStackNavigator';
import { AgentTabScene } from './AgentTabScene';
import { FloatingTabBar, AGENT_TAB_ICONS, floatingTabBarNavigatorScreenOptions, useFloatingTabBarSceneStyle } from './FloatingTabBar';
import type { AgentRootStackParamList, AgentTabParamList } from './types';
import {
  agentRootStackHeaderScreenOptions,
  agentTabHeaderScreenOptions,
} from './agentHeaderOptions';

const Tab = createBottomTabNavigator<AgentTabParamList>();
const RootStack = createNativeStackNavigator<AgentRootStackParamList>();

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
        // Members tab renders its own matching header via AgentFarmersStackNavigator.
        headerShown: route.name !== 'Farmers',
        ...agentTabHeaderScreenOptions,
        ...floatingTabBarNavigatorScreenOptions,
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
          ...agentRootStackHeaderScreenOptions,
        }}
      />
    </RootStack.Navigator>
  );
}
