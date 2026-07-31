import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput as RNTextInput, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
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
    <View className="flex-1 bg-white p-6">
      <Text className="mt-6 text-center text-[26px] font-bold text-[#1A4D3E]">Verify your number</Text>
      <Text className="mt-2 text-center text-[15px] leading-[22px] text-[#757575]">
        Enter the 6-digit code sent to{'\n'}{phone}
      </Text>

      <View className="mb-2 mt-5 rounded-lg bg-[#FFF8E1] p-3">
        <Text className="text-center font-medium text-[#333333]">Dev code: 123456</Text>
      </View>

      <View className="my-6 flex-row justify-center gap-2.5">
        {digits.map((d, i) => (
          <RNTextInput
            key={i}
            ref={(r) => { inputs.current[i] = r; }}
            className={cn(
              'h-14 w-12 rounded-xl border-2 border-[#E0E0E0] bg-[#F5F5F5] text-center text-2xl font-bold text-[#1A4D3E]',
              d && 'border-[#1A4D3E] bg-[#E8F5E9]'
            )}
            value={d}
            onChangeText={(t) => handleDigit(t, i)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      {error ? <Text className="mb-3 text-center text-[#D32F2F]">{error}</Text> : null}

      <Button className="mb-3 h-12 rounded-xl bg-[#1A4D3E]" disabled={loading} onPress={handleVerify}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Verify & Sign In</Text>}
      </Button>

      <Button variant="ghost" disabled={resendIn > 0} onPress={handleResend}>
        <Text className="text-[#1A4D3E]">
          {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend via SMS'}
        </Text>
      </Button>
    </View>
  );
}
