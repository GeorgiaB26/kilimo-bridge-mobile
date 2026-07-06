import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { requestOtp, verifyOtp, setAuthToken, api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { clearAllSessionData } from '../../utils/session';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const DEMO_FARMER = '+254712345678';
const DEMO_ADMIN = '+254700000002';
const DEMO_AGENT = '+254700000003';
const DEMO_BANKING = '+254700000004';
const DEMO_OTP = '123456';
const BANKING_PASSWORD = 'Banking@2026';

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number');
      return;
    }
    setLoading(true);
    try {
      const result = await requestOtp(phone);
      navigation.navigate('Otp', { phone, devCode: result.devCode });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message
          ?? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to send OTP. Is the backend running on port 3001?';
      Alert.alert('Error', msg ?? 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    await clearAllSessionData();
    Alert.alert('Session cleared', 'You can now sign in as a different user.');
  };

  const quickLogin = async (demoPhone: string, label: string) => {
    setLoading(true);
    try {
      await clearAllSessionData();
      await requestOtp(demoPhone);
      const { token, user } = await verifyOtp(demoPhone, DEMO_OTP);
      setAuthToken(token);
      await setAuth(token, user);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error
          ?? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : `Could not open ${label}. Try: rm backend/data/kilimo.db then restart backend.`;
      Alert.alert('Login failed', msg ?? 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Kilimo Bridge" subtitle="Sign in with your phone number" />
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

      <Text style={styles.quickTitle}>Quick access (one tap)</Text>
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
          setLoading(true);
          try {
            await clearAllSessionData();
            const { data } = await api.post('/auth/login', { phone: DEMO_BANKING, password: BANKING_PASSWORD });
            setAuthToken(data.token);
            await setAuth(data.token, data.user);
          } catch {
            Alert.alert('Login failed', 'Banking login failed. Reset DB: npm run reset');
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
        <Text style={styles.demoTitle}>Manual login (OTP: 123456)</Text>
        <Text style={styles.demoItem}>Farmer: {DEMO_FARMER}</Text>
        <Text style={styles.demoItem}>Admin: {DEMO_ADMIN}</Text>
        <Text style={styles.demoItem}>Agent: {DEMO_AGENT}</Text>
        <Text style={styles.demoItem}>Banking: {DEMO_BANKING} / {BANKING_PASSWORD}</Text>
        <Text style={styles.demoNote}>
          Refreshing the browser does not sign you out. Use &quot;Switch account&quot; or &quot;Clear saved login&quot;.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
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
