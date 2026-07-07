import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Surface } from 'react-native-paper';
import { COLORS } from '../../constants';
import { verifyOtp, requestOtp, setAuthToken } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

const OTP_LENGTH = 6;

export function OtpScreen({ route }: Props) {
  const { phone, devCode } = route.params;
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(45);
  const inputs = useRef<(RNTextInput | null)[]>([]);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (devCode) {
      setDigits(devCode.padEnd(OTP_LENGTH, '').slice(0, OTP_LENGTH).split(''));
    }
  }, [devCode]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const code = digits.join('');

  const handleDigit = (text: string, index: number) => {
    const char = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setError(null);
    if (code.length < OTP_LENGTH) {
      setError('Enter all 6 digits');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await verifyOtp(phone, code);
      setAuthToken(token);
      await setAuth(token, user);
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Invalid OTP — use 123456 in dev mode');
      setError(msg);
      showMessage('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    try {
      await requestOtp(phone);
      setResendIn(45);
      showMessage('OTP Sent', 'A new code was sent (dev: 123456)');
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not resend'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your number</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to{'\n'}{phone}</Text>

      <Surface style={styles.devBanner} elevation={0}>
        <Text style={styles.devText}>Dev code: 123456</Text>
      </Surface>

      <View style={styles.otpRow}>
        {digits.map((d, i) => (
          <RNTextInput
            key={i}
            ref={(r) => { inputs.current[i] = r; }}
            style={[styles.otpBox, d ? styles.otpBoxFilled : null]}
            value={d}
            onChangeText={(t) => handleDigit(t, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        mode="contained"
        onPress={handleVerify}
        loading={loading}
        buttonColor={COLORS.primary}
        style={styles.verifyBtn}
        contentStyle={{ minHeight: 48 }}
      >
        Verify & Sign In
      </Button>

      <Button mode="text" onPress={handleResend} disabled={resendIn > 0} textColor={COLORS.primary}>
        {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend via SMS'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: COLORS.background },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary, textAlign: 'center', marginTop: 24 },
  subtitle: { fontSize: 15, color: COLORS.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  devBanner: { backgroundColor: '#FFF8E1', padding: 12, borderRadius: 8, marginTop: 20, marginBottom: 8 },
  devText: { textAlign: 'center', color: COLORS.text, fontWeight: '500' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 24 },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  otpBoxFilled: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  error: { color: COLORS.alert, textAlign: 'center', marginBottom: 12 },
  verifyBtn: { borderRadius: 12, marginBottom: 12 },
});
