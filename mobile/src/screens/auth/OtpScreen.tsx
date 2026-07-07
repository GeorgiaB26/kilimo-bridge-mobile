import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { verifyOtp, setAuthToken } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

export function OtpScreen({ route }: Props) {
  const { phone, devCode } = route.params;
  const [code, setCode] = useState(devCode ?? '123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleVerify = async () => {
    setError(null);
    if (!code.trim()) {
      setError('Please enter the 6-digit OTP code');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await verifyOtp(phone, code.trim());
      setAuthToken(token);
      await setAuth(token, user);
      // RootNavigator switches to the role platform when isAuthenticated becomes true
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Invalid OTP or backend error. Use code 123456 and ensure backend is running.');
      setError(msg);
      showMessage('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Enter OTP" subtitle={`Code sent to ${phone}`} />
      <View style={styles.devBanner}>
        <Text style={styles.devText}>Dev mode — enter code: 123456</Text>
      </View>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <FormField
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        required
      />
      <Button title="Verify & Sign In" onPress={handleVerify} loading={loading} />
      <Text style={styles.tip}>
        Stuck? Go back and use &quot;Open Farmer Platform&quot; on the login screen — it skips OTP.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  devBanner: {
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  devText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  errorBanner: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: '#C62828', fontSize: 14, lineHeight: 20 },
  tip: { marginTop: 16, fontSize: 13, color: COLORS.muted, lineHeight: 18 },
});
