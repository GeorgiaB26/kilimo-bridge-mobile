import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { verifyOtp, setAuthToken } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

export function OtpScreen({ route }: Props) {
  const { phone, devCode } = route.params;
  const [code, setCode] = useState(devCode ?? '');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleVerify = async () => {
    if (!code.trim()) {
      Alert.alert('Required', 'Please enter the OTP code');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await verifyOtp(phone, code);
      setAuthToken(token);
      await setAuth(token, user);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Invalid OTP';
      Alert.alert('Login Failed', msg ?? 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Enter OTP" subtitle={`Code sent to ${phone}`} />
      {devCode ? (
        <View style={styles.devBanner}>
          <Text style={styles.devText}>Dev mode — use code: {devCode}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  devBanner: {
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  devText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
});
