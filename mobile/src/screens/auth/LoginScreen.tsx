import React, { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Linking } from 'react-native';
import { Briefcase, Globe, Headset, Sprout, UserRound } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KilimoLogo } from '../../components/KilimoLogo';
import { API_BASE_URL, IS_HOSTED_API, IS_API_MISCONFIGURED } from '../../constants';
import { APP_BUILD } from '../../constants/build';
import { requestOtp, devTokenLogin, devQuickLogin, setAuthToken, checkBackendHealth } from '../../api/client';
import { TestUserSwitcher } from '../../components/auth/TestUserSwitcher';
import { SHOW_TEST_USER_SWITCHER, TEST_SWITCHER_USERS, type TestSwitcherRole } from '../../constants/testUsers';
import { useAuthStore } from '../../store/authStore';
import { useRegistrationStore } from '../../store/registrationStore';
import { clearAllSessionData } from '../../utils/session';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';
import { SUPPORT_DESK_PHONE } from '../../../shared/src/supportDesk';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const DEMO_FARMER = '+254712345678';
const DEMO_AGENT = '+254700000003';
const PORTAL_URL = 'https://bridge-ease-flow.lovable.app';

const BACKEND_OFFLINE_MSG = IS_API_MISCONFIGURED
  ? 'Netlify not configured: set EXPO_PUBLIC_API_URL to https://kilimo-bridge-mobile.onrender.com/api then redeploy.'
  : IS_HOSTED_API
    ? `Cannot reach API at ${API_BASE_URL}. Try quick login below, or wait 30s and refresh.`
    : 'Backend offline — run: npm run backend';

function LoginTypeCard({
  Icon,
  title,
  subtitle,
  onPress,
  disabled,
  variant,
}: {
  Icon: ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  variant: 'farmer' | 'agent' | 'support';
}) {
  const filled = variant === 'farmer' || variant === 'support';
  const borderBg =
    variant === 'farmer'
      ? 'border-[#1A4D3E] bg-[#1A4D3E]'
      : variant === 'support'
        ? 'border-[#1F4E78] bg-[#1F4E78]'
        : 'border-[#1A4D3E] bg-white';
  const iconColor = filled ? '#FFFFFF' : '#1A4D3E';
  const titleColor = filled ? 'text-white' : 'text-[#1A4D3E]';
  const subtitleColor = filled ? 'text-white/85' : 'text-[#757575]';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`mb-3 rounded-xl border-2 p-4 ${borderBg} ${disabled ? 'opacity-60' : 'active:opacity-90'}`}
    >
      <View className="flex-row items-center gap-1.5">
        <Icon size={18} color={iconColor} />
        <Text className={`text-base font-bold ${titleColor}`}>{title}</Text>
      </View>
      <Text className={`mt-1 text-sm ${subtitleColor}`}>Phone: {subtitle}</Text>
    </Pressable>
  );
}

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

  const quickLoginAsRole = async (role: TestSwitcherRole) => {
    setError(null);
    setLoading(true);
    try {
      await clearAllSessionData();
      const testUser = TEST_SWITCHER_USERS[role];
      const { token, user } = await devTokenLogin(role, testUser.phone);
      setAuthToken(token);
      await setAuth(token, user);
      setBackendOk(true);
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Dev login failed');
      setError(msg);
      setBackendOk(false);
      showMessage('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const openPortal = async () => {
    try {
      await Linking.openURL(PORTAL_URL);
    } catch {
      showMessage('Could not open portal', PORTAL_URL);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-5 pb-10">
      <View className="mb-6 mt-4 items-center">
        <KilimoLogo size={140} />
        <Text className="mt-3 text-lg font-bold text-[#1A4D3E]">Kilimo Bridge</Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <Globe size={16} color="#757575" />
          <Text className="text-sm text-[#757575]">Farm to Market Platform</Text>
        </View>
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
        <Button
          variant="outline"
          className="mt-3 h-12 rounded-xl border-[#1A4D3E]"
          onPress={() => {
            useRegistrationStore.getState().resetForm();
            navigation.navigate('Register');
          }}
          disabled={loading}
        >
          <Text className="font-semibold text-[#1A4D3E]">Create an account</Text>
        </Button>
        <Text className="mt-2 text-center text-xs text-[#757575]">
          Step 1: choose Farmer, Field Agent, Admin, or Project Manager
        </Text>
      </View>

      <Text className="mb-3 text-sm font-semibold text-[#757575]">Choose your login type:</Text>
      <LoginTypeCard
        Icon={Sprout}
        title="FARMER LOGIN"
        subtitle={DEMO_FARMER}
        variant="farmer"
        disabled={loading}
        onPress={() => quickLogin(DEMO_FARMER, 'Farmer')}
      />
      <LoginTypeCard
        Icon={UserRound}
        title="FIELD AGENT LOGIN"
        subtitle={DEMO_AGENT}
        variant="agent"
        disabled={loading}
        onPress={() => quickLogin(DEMO_AGENT, 'Field Agent')}
      />
      <LoginTypeCard
        Icon={Headset}
        title="SUPPORT LOGIN"
        subtitle={SUPPORT_DESK_PHONE}
        variant="support"
        disabled={loading}
        onPress={() => quickLogin(SUPPORT_DESK_PHONE, 'Support')}
      />

      <Pressable onPress={openPortal} className="mb-4 py-2">
        <View className="flex-row flex-wrap items-center justify-center gap-1.5">
          <Briefcase size={16} color="#1A4D3E" />
          <Text className="text-center text-sm text-[#1A4D3E]">
            Admin or Aggregation Centre access? → <Text className="font-bold">Portal</Text>
          </Text>
        </View>
      </Pressable>

      {SHOW_TEST_USER_SWITCHER ? (
        <TestUserSwitcher loading={loading} onSelect={quickLoginAsRole} />
      ) : null}

      <Button
        variant="ghost"
        className="mt-2"
        onPress={() => clearAllSessionData().then(() => showMessage('Done', 'Session cleared'))}
      >
        <Text className="text-[#757575]">Clear saved login</Text>
      </Button>
      <Text className="mt-2 text-center text-[11px] text-[#757575]">Build {APP_BUILD}</Text>
    </ScrollView>
  );
}
