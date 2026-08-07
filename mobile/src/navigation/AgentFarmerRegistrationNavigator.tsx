import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StepIndicator } from '../components/StepIndicator';
import { COLORS } from '../constants';
import { CountrySelectionScreen } from '../screens/registration/CountrySelectionScreen';
import { BasicInfoScreen } from '../screens/registration/BasicInfoScreen';
import { LocationScreen } from '../screens/registration/LocationScreen';
import { MembershipScreen } from '../screens/registration/MembershipScreen';
import { DetailsScreen } from '../screens/registration/DetailsScreen';
import { ProjectsScreen } from '../screens/registration/ProjectsScreen';
import { PhotoScreen } from '../screens/registration/PhotoScreen';
import { ConfirmScreen } from '../screens/registration/ConfirmScreen';
import type { RegistrationStackParamList } from './types';

const Stack = createNativeStackNavigator<RegistrationStackParamList>();

const FARMER_STEP_LABELS = ['Country', 'Basic Info', 'Location', 'Membership', 'Details', 'Projects', 'Photo', 'Confirm'];

const FARMER_STEP_MAP: Partial<Record<keyof RegistrationStackParamList, number>> = {
  Country: 0,
  BasicInfo: 1,
  Location: 2,
  Membership: 3,
  Details: 4,
  Projects: 5,
  Photo: 6,
  Confirm: 7,
};

function withFarmerLayout<P extends object>(
  Screen: React.ComponentType<P>,
  routeName: keyof RegistrationStackParamList
) {
  return function WrappedScreen(props: P) {
    const step = FARMER_STEP_MAP[routeName] ?? 0;
    const body =
      routeName === 'Confirm' ? (
        <Screen {...props} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Screen {...props} />
        </ScrollView>
      );

    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <StepIndicator currentStep={step} totalSteps={8} labels={FARMER_STEP_LABELS} />
        {body}
      </SafeAreaView>
    );
  };
}

/** Farmer-only registration flow for field agents (skips public user-type picker). */
export function AgentFarmerRegistrationNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Country"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Country"
        component={withFarmerLayout(CountrySelectionScreen, 'Country')}
        options={{ title: 'Register farmer' }}
      />
      <Stack.Screen name="BasicInfo" component={withFarmerLayout(BasicInfoScreen, 'BasicInfo')} />
      <Stack.Screen name="Location" component={withFarmerLayout(LocationScreen, 'Location')} />
      <Stack.Screen name="Membership" component={withFarmerLayout(MembershipScreen, 'Membership')} />
      <Stack.Screen name="Details" component={withFarmerLayout(DetailsScreen, 'Details')} />
      <Stack.Screen name="Projects" component={withFarmerLayout(ProjectsScreen, 'Projects')} />
      <Stack.Screen name="Photo" component={withFarmerLayout(PhotoScreen, 'Photo')} />
      <Stack.Screen name="Confirm" component={withFarmerLayout(ConfirmScreen, 'Confirm')} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
