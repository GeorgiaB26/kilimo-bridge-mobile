import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator } from 'react-native-paper';
import { useAuthStore, isAdminRole, isAgentRole, isBankingRole } from '../store/authStore';
import { setAuthToken } from '../api/client';
import { AuthNavigator } from './AuthNavigator';
import { FarmerNavigator } from './FarmerNavigator';
import { AdminPlatformNavigator } from './AdminPlatformNavigator';
import { AgentNavigator } from './AgentNavigator';
import { BankingNavigator } from './BankingNavigator';
import { AccountSwitcherBar } from '../components/AccountSwitcherBar';
import { SplashScreen } from '../screens/splash/SplashScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { COLORS } from '../constants';

const ONBOARDING_KEY = 'kilimo_onboarding_done';

type BootPhase = 'splash' | 'onboarding' | 'ready';

export function RootNavigator() {
  const { isLoading, isAuthenticated, user, token, loadStoredAuth } = useAuthStore();
  const [bootPhase, setBootPhase] = useState<BootPhase>('splash');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => { loadStoredAuth(); }, [loadStoredAuth]);
  useEffect(() => { if (token) setAuthToken(token); }, [token]);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setOnboardingDone(v === '1'));
  }, []);

  const finishSplash = useCallback(() => {
    const go = (done: boolean) => {
      setOnboardingDone(done);
      setBootPhase(done ? 'ready' : 'onboarding');
    };
    if (onboardingDone !== null) {
      go(onboardingDone);
      return;
    }
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => go(v === '1'));
  }, [onboardingDone]);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    setOnboardingDone(true);
    setBootPhase('ready');
  }, []);

  if (bootPhase === 'splash') {
    return <SplashScreen onFinish={finishSplash} />;
  }

  if (bootPhase === 'onboarding' && !onboardingDone) {
    return <OnboardingScreen onComplete={finishOnboarding} />;
  }

  if (isLoading || onboardingDone === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator animating size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!isAuthenticated || !user) return <AuthNavigator />;

  const role = user.role;

  return (
    <View style={styles.root}>
      <AccountSwitcherBar />
      {role === 'farmer' ? <FarmerNavigator />
        : isBankingRole(role) ? <BankingNavigator />
        : isAgentRole(role) ? <AgentNavigator />
        : isAdminRole(role) || role === 'super_admin' ? <AdminPlatformNavigator />
        : <AuthNavigator />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
});
