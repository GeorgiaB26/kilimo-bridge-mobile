import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput, Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { KilimoLogo } from '../../components/KilimoLogo';
import { COLORS } from '../../constants';
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
        setError('Backend offline — run: npm run backend');
        return;
      }
      const result = await requestOtp(phone);
      navigation.navigate('Otp', { phone, devCode: result.devCode });
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Failed to send OTP');
      setError(msg);
      showMessage('Could not send OTP', msg);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoPhone: string, label: string) => {
    setError(null);
    setLoading(true);
    try {
      await clearAllSessionData();
      if (!(await checkBackendHealth())) {
        setError('Backend offline — run: npm run backend');
        return;
      }
      const { token, user } = await devQuickLogin(demoPhone);
      setAuthToken(token);
      await setAuth(token, user);
    } catch (err: unknown) {
      const msg = extractApiError(err, `Could not open ${label}`);
      setError(msg);
      showMessage('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.logoWrap}>
        <KilimoLogo width={240} height={66} />
        <Text style={styles.platformName}>Kilimo Bridge Platform</Text>
      </View>

      {backendOk === false ? (
        <Surface style={styles.bannerError} elevation={0}>
          <Ionicons name="cloud-offline-outline" size={20} color={COLORS.alert} />
          <Text style={styles.bannerErrorText}>Backend offline — run npm run backend in Terminal</Text>
        </Surface>
      ) : backendOk ? (
        <Surface style={styles.bannerOk} elevation={0}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
          <Text style={styles.bannerOkText}>Connected</Text>
        </Surface>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Surface style={styles.card} elevation={1}>
        <Text style={styles.cardTitle}>Sign in with phone</Text>
        <TextInput
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+254712345678"
          keyboardType="phone-pad"
          mode="outlined"
          style={styles.input}
          outlineColor={COLORS.border}
          activeOutlineColor={COLORS.primary}
        />
        <Button
          mode="contained"
          onPress={handleSendOtp}
          loading={loading}
          disabled={loading}
          buttonColor={COLORS.primary}
          style={styles.primaryBtn}
          contentStyle={styles.btnContent}
        >
          Send OTP
        </Button>
      </Surface>

      <Text style={styles.quickTitle}>Quick access</Text>
      <Button mode="contained" onPress={() => quickLogin(DEMO_FARMER, 'Farmer')} loading={loading} buttonColor={COLORS.primary} style={styles.quickBtn}>
        Open Farmer Platform
      </Button>
      <Button mode="contained-tonal" onPress={() => quickLogin(DEMO_ADMIN, 'Admin')} loading={loading} style={styles.quickBtn}>
        Open Admin Dashboard
      </Button>
      <Button mode="outlined" onPress={() => quickLogin(DEMO_AGENT, 'Agent')} loading={loading} style={styles.quickBtn}>
        Open Agent Platform
      </Button>
      <Button
        mode="outlined"
        loading={loading}
        style={styles.quickBtn}
        onPress={async () => {
          setLoading(true);
          try {
            await clearAllSessionData();
            const { data } = await api.post('/auth/login', { phone: DEMO_BANKING, password: BANKING_PASSWORD });
            setAuthToken(data.token);
            await setAuth(data.token, data.user);
          } catch (err: unknown) {
            showMessage('Login failed', extractApiError(err, 'Banking login failed'));
          } finally {
            setLoading(false);
          }
        }}
      >
        Open Banking Platform
      </Button>

      <Button mode="text" onPress={() => clearAllSessionData().then(() => showMessage('Done', 'Session cleared'))} textColor={COLORS.muted}>
        Clear saved login
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 20, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 24, marginTop: 16 },
  platformName: { fontSize: 18, fontWeight: '700', color: COLORS.primary, marginTop: 12 },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    marginBottom: 12,
  },
  bannerErrorText: { flex: 1, color: COLORS.alert, fontSize: 13 },
  bannerOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    marginBottom: 12,
    alignSelf: 'center',
  },
  bannerOkText: { color: COLORS.success, fontWeight: '600', fontSize: 13 },
  errorText: { color: COLORS.alert, marginBottom: 12, fontSize: 14 },
  card: { padding: 20, borderRadius: 16, backgroundColor: COLORS.background, marginBottom: 24 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 16 },
  input: { marginBottom: 16, backgroundColor: COLORS.background },
  primaryBtn: { borderRadius: 12 },
  btnContent: { minHeight: 48 },
  quickTitle: { fontSize: 14, fontWeight: '600', color: COLORS.muted, marginBottom: 12 },
  quickBtn: { marginBottom: 10, borderRadius: 12 },
});
