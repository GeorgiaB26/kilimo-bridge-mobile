import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StepIndicator } from '../components/StepIndicator';
import { COLORS } from '../constants';
import { BasicInfoScreen } from '../screens/registration/BasicInfoScreen';
import { LocationScreen } from '../screens/registration/LocationScreen';
import { MembershipScreen } from '../screens/registration/MembershipScreen';
import { DetailsScreen } from '../screens/registration/DetailsScreen';
import { ProjectsScreen } from '../screens/registration/ProjectsScreen';
import { PhotoScreen } from '../screens/registration/PhotoScreen';
import { ConfirmScreen } from '../screens/registration/ConfirmScreen';
import type { RegistrationStackParamList } from './types';

const Stack = createNativeStackNavigator<RegistrationStackParamList>();

const STEP_LABELS = ['Basic Info', 'Location', 'Membership', 'Details', 'Projects', 'Photo', 'Confirm'];

const STEP_MAP: Record<keyof RegistrationStackParamList, number> = {
  BasicInfo: 0,
  Location: 1,
  Membership: 2,
  Details: 3,
  Projects: 4,
  Photo: 5,
  Confirm: 6,
};

function withLayout<P extends object>(
  Screen: React.ComponentType<P>,
  routeName: keyof RegistrationStackParamList
) {
  return function WrappedScreen(props: P) {
    const step = STEP_MAP[routeName];
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <StepIndicator currentStep={step} totalSteps={7} labels={STEP_LABELS} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Screen {...props} />
        </ScrollView>
      </SafeAreaView>
    );
  };
}

export function RegistrationNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        title: 'Register Farmer',
      }}
    >
      <Stack.Screen name="BasicInfo" component={withLayout(BasicInfoScreen, 'BasicInfo')} />
      <Stack.Screen name="Location" component={withLayout(LocationScreen, 'Location')} />
      <Stack.Screen name="Membership" component={withLayout(MembershipScreen, 'Membership')} />
      <Stack.Screen name="Details" component={withLayout(DetailsScreen, 'Details')} />
      <Stack.Screen name="Projects" component={withLayout(ProjectsScreen, 'Projects')} />
      <Stack.Screen name="Photo" component={withLayout(PhotoScreen, 'Photo')} />
      <Stack.Screen name="Confirm" component={withLayout(ConfirmScreen, 'Confirm')} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
