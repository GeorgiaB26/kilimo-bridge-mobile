import React, { useState, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KilimoLogo } from '../../components/KilimoLogo';
import { API_BASE_URL, IS_HOSTED_API, IS_API_MISCONFIGURED } from '../../constants';
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

const BACKEND_OFFLINE_MSG = IS_API_MISCONFIGURED
  ? 'Netlify not configured: set EXPO_PUBLIC_API_URL to https://kilimo-bridge-mobile.onrender.com/api then redeploy.'
  : IS_HOSTED_API
    ? `Cannot reach API at ${API_BASE_URL}. Try Quick access below, or wait 30s and refresh.`
    : 'Backend offline — run: npm run backend';

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
      const result = await requestOtp(phone);
      setBackendOk(true);
      navigation.navigate('Otp', { phone, devCode: result.devCode });
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Failed to send OTP');
      setError(msg);
      setBackendOk(false);
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
      const { token, user } = await devQuickLogin(demoPhone);
      setAuthToken(token);
      await setAuth(token, user);
      setBackendOk(true);
    } catch (err: unknown) {
      const msg = extractApiError(err, `Could not open ${label}`);
      setError(msg);
      setBackendOk(false);
      showMessage('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-5 pb-10">
      <View className="mb-6 mt-4 items-center">
        <KilimoLogo width={240} height={66} />
        <Text className="mt-3 text-lg font-bold text-[#1A4D3E]">Kilimo Bridge Platform</Text>
      </View>

      {backendOk === false ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-lg bg-[#FFEBEE] p-3">
          <Ionicons name="cloud-offline-outline" size={20} color="#D32F2F" />
          <View className="flex-1">
            <Text className="text-[13px] text-[#D32F2F]">{BACKEND_OFFLINE_MSG}</Text>
            {IS_HOSTED_API ? (
              <Text className="mt-1.5 text-[11px] text-[#757575]">API: {API_BASE_URL}</Text>
            ) : null}
          </View>
        </View>
      ) : backendOk ? (
        <View className="mb-3 flex-row items-center gap-1.5 self-center rounded-lg bg-[#E8F5E9] p-2.5">
          <Ionicons name="checkmark-circle" size={18} color="#2E7D5E" />
          <Text className="text-[13px] font-semibold text-[#2E7D5E]">Connected</Text>
        </View>
      ) : null}

      {error ? <Text className="mb-3 text-sm text-[#D32F2F]">{error}</Text> : null}

      <View className="mb-6 rounded-2xl bg-white p-5">
        <Text className="mb-4 text-base font-semibold text-[#333333]">Sign in with phone</Text>
        <TextInput
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+254712345678"
          keyboardType="phone-pad"
          mode="outlined"
          style={{ marginBottom: 16, backgroundColor: '#FFFFFF' }}
          outlineColor="#E0E0E0"
          activeOutlineColor="#1A4D3E"
        />
        <Button className="h-12 rounded-xl bg-[#1A4D3E]" disabled={loading} onPress={handleSendOtp}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Send OTP</Text>}
        </Button>
      </View>

      <Text className="mb-3 text-sm font-semibold text-[#757575]">Quick access — tap to log in</Text>
      <Button className="mb-2.5 h-12 rounded-xl bg-[#1A4D3E]" disabled={loading} onPress={() => quickLogin(DEMO_FARMER, 'Farmer')}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Open Farmer Platform</Text>}
      </Button>
      <Button className="mb-2.5 h-12 rounded-xl bg-[#E8F5E9]" disabled={loading} onPress={() => quickLogin(DEMO_ADMIN, 'Admin')}>
        <Text className="text-[#1A4D3E]">Open Admin Dashboard</Text>
      </Button>
      <Button variant="outline" className="mb-2.5 h-12 rounded-xl" disabled={loading} onPress={() => quickLogin(DEMO_AGENT, 'Agent')}>
        <Text>Open Agent Platform</Text>
      </Button>
      <Button variant="outline" className="mb-2.5 h-12 rounded-xl" onPress={() => navigation.navigate('AggregationLogin')}>
        <Text>Aggregation Centre Login</Text>
      </Button>
      <Button
        variant="outline"
        className="mb-2.5 h-12 rounded-xl"
        disabled={loading}
        onPress={async () => {
          setLoading(true);
          try {
            await clearAllSessionData();
            const { data } = await api.post('/auth/login', { phone: DEMO_BANKING, password: BANKING_PASSWORD });
            setAuthToken(data.token);
            await setAuth(data.token, data.user);
            setBackendOk(true);
          } catch (err: unknown) {
            showMessage('Login failed', extractApiError(err, 'Banking login failed'));
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? <ActivityIndicator color="#1A4D3E" /> : <Text>Open Banking Platform</Text>}
      </Button>

      <Button
        variant="ghost"
        onPress={() => clearAllSessionData().then(() => showMessage('Done', 'Session cleared'))}
      >
        <Text className="text-[#757575]">Clear saved login</Text>
      </Button>
      <Text className="mt-2 text-center text-[11px] text-[#757575]">Build {APP_BUILD}</Text>
    </ScrollView>
  );
}
