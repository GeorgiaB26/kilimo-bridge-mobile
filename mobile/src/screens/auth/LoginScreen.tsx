import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { APP_BUILD } from '../../constants/build';
import { requestOtp, devQuickLogin, setAuthToken, api, checkBackendHealth } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { clearAllSessionData } from '../../utils/session';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const DEMO_FARMER = '+254712345678';
const DEMO_ADMIN = '+254700000002';
const DEMO_AGENT = '+254700000003';
const DEMO_BANKING = '+254700000004';
const BANKING_PASSWORD = 'Banking@2026';

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  const handleSendOtp = async () => {
    setError(null);
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    setLoading(true);
    try {
      const healthy = await checkBackendHealth();
      setBackendOk(healthy);
      if (!healthy) {
        setError('Backend is not running. Start it: cd ~/kilimo-bridge-mobile/backend && npm run dev');
        return;
      }
      const result = await requestOtp(phone);
      navigation.navigate('Otp', { phone, devCode: result.devCode });
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Failed to send OTP. Is the backend running on port 3001?');
      setError(msg);
      showMessage('Could not send OTP', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    await clearAllSessionData();
    setError(null);
    showMessage('Session cleared', 'You can now sign in as a different user.');
  };

  const quickLogin = async (demoPhone: string, label: string) => {
    setError(null);
    setLoading(true);
    try {
      await clearAllSessionData();
      const healthy = await checkBackendHealth();
      setBackendOk(healthy);
      if (!healthy) {
        const msg = 'Backend is not running. Start it: cd ~/kilimo-bridge-mobile/backend && npm run dev';
        setError(msg);
        showMessage('Backend offline', msg);
        return;
      }
      const { token, user } = await devQuickLogin(demoPhone);
      setAuthToken(token);
      await setAuth(token, user);
    } catch (err: unknown) {
      const msg = extractApiError(err, `Could not open ${label}. Try: npm run reset then restart backend.`);
      setError(msg);
      showMessage('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Kilimo Bridge" subtitle={`Sign in · ${APP_BUILD}`} />

      {backendOk === false ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>
            Backend offline — start it in Terminal: cd ~/kilimo-bridge-mobile/backend && npm run dev
          </Text>
        </View>
      ) : backendOk === true ? (
        <View style={styles.okBanner}>
          <Text style={styles.okText}>Backend connected</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.hint}>
          Farmers and admins use the same login. Your role determines which platform you see.
        </Text>
        <FormField
          label="Phone Number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+254712345678"
          keyboardType="phone-pad"
          required
        />
        <Button title="Send OTP" onPress={handleSendOtp} loading={loading} />
      </View>

      <Text style={styles.quickTitle}>Quick access (one tap — no OTP needed)</Text>
      <Button
        title="Open Farmer Platform"
        onPress={() => quickLogin(DEMO_FARMER, 'Farmer Platform')}
        loading={loading}
        style={styles.quickBtn}
      />
      <Button
        title="Open Admin Dashboard"
        onPress={() => quickLogin(DEMO_ADMIN, 'Admin Dashboard')}
        variant="secondary"
        loading={loading}
        style={styles.quickBtn}
      />
      <Button
        title="Open Agent Platform"
        onPress={() => quickLogin(DEMO_AGENT, 'Agent Platform')}
        variant="outline"
        loading={loading}
        style={styles.quickBtn}
      />
      <Button
        title="Open Banking Platform"
        onPress={async () => {
          setError(null);
          setLoading(true);
          try {
            await clearAllSessionData();
            const { data } = await api.post('/auth/login', { phone: DEMO_BANKING, password: BANKING_PASSWORD });
            setAuthToken(data.token);
            await setAuth(data.token, data.user);
          } catch (err: unknown) {
            const msg = extractApiError(err, 'Banking login failed. Run: npm run reset');
            setError(msg);
            showMessage('Login failed', msg);
          } finally {
            setLoading(false);
          }
        }}
        variant="outline"
        loading={loading}
        style={styles.quickBtn}
      />

      <Button
        title="Clear saved login"
        onPress={handleClearSession}
        variant="outline"
        style={styles.clearBtn}
      />

      <View style={styles.demoBox}>
        <Text style={styles.demoTitle}>Manual OTP login (code: 123456)</Text>
        <Text style={styles.demoItem}>Farmer: {DEMO_FARMER}</Text>
        <Text style={styles.demoItem}>Admin: {DEMO_ADMIN}</Text>
        <Text style={styles.demoItem}>Agent: {DEMO_AGENT}</Text>
        <Text style={styles.demoItem}>Banking: {DEMO_BANKING} / {BANKING_PASSWORD}</Text>
        <Text style={styles.demoNote}>
          Tip: Use the quick-access buttons above — they skip OTP entirely.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  warnBanner: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 12 },
  warnText: { color: '#C62828', fontSize: 13, lineHeight: 18 },
  okBanner: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 8, marginBottom: 12 },
  okText: { color: COLORS.success, fontSize: 13, fontWeight: '600' },
  errorBanner: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: COLORS.alert },
  errorText: { color: '#C62828', fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  hint: { fontSize: 14, color: COLORS.muted, marginBottom: 16, lineHeight: 20 },
  quickTitle: { fontSize: 16, fontWeight: '600', color: COLORS.primary, marginBottom: 10 },
  quickBtn: { marginBottom: 10 },
  clearBtn: { marginBottom: 20 },
  demoBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  demoTitle: { fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  demoItem: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  demoNote: { fontSize: 12, color: COLORS.muted, marginTop: 8, fontStyle: 'italic' },
});
