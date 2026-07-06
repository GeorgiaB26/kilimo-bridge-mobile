import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore, isAdminRole } from '../store/authStore';
import { setAuthToken } from '../api/client';
import { AuthNavigator } from './AuthNavigator';
import { FarmerNavigator } from './FarmerNavigator';
import { AdminPlatformNavigator } from './AdminPlatformNavigator';
import { AccountSwitcherBar } from '../components/AccountSwitcherBar';
import { COLORS } from '../constants';

export function RootNavigator() {
  const { isLoading, isAuthenticated, user, token, loadStoredAuth } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <AuthNavigator />;
  }

  return (
    <View style={styles.root}>
      <AccountSwitcherBar />
      {user.role === 'farmer' ? (
        <FarmerNavigator />
      ) : isAdminRole(user.role) ? (
        <AdminPlatformNavigator />
      ) : (
        <AuthNavigator />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
});
