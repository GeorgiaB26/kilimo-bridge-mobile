import React, { useState, useEffect } from 'react';
import { ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput, Menu, Button as PaperButton } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { aggregationCentreLogin, getAggregationCentres, setAuthToken } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { extractApiError } from '../../utils/feedback';
/** Deprecated on mobile — aggregation centre staff use the Loveable portal. Kept for reference. */
type AggregationLoginParams = { AggregationLogin: undefined };

type Props = NativeStackScreenProps<AggregationLoginParams, 'AggregationLogin'>;

const DEMO_AGENT_PHONE = '+254700000003';
const DEMO_PASSWORD = '12345';

export function AggregationCentreLoginScreen({ navigation }: Props) {
  const [centres, setCentres] = useState<Array<{ centre_id: string; name: string }>>([]);
  const [centreId, setCentreId] = useState('');
  const [phone, setPhone] = useState(DEMO_AGENT_PHONE);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    getAggregationCentres()
      .then((d) => {
        const list = d.centres ?? [];
        setCentres(list);
        if (list[0]) setCentreId(list[0].centre_id);
      })
      .catch(() => setCentres([]));
  }, []);

  const centreName = centres.find((c) => c.centre_id === centreId)?.name ?? 'Select centre';

  const login = async () => {
    setError(null);
    if (!centreId || !phone.trim() || !password) {
      setError('Centre, phone, and password are required');
      return;
    }
    setLoading(true);
    try {
      const result = await aggregationCentreLogin({
        centre_id: centreId,
        phone_number: phone.trim(),
        password,
      });
      setAuthToken(result.token);
      await setAuth(result.token, result.user);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Login failed — try demo agent +254700000003 / 12345'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-6">
      <Text className="text-[26px] font-bold text-[#1A4D3E]">Aggregation Centre</Text>
      <Text className="mb-6 mt-1.5 text-sm text-[#757575]">Staff login for delivery intake and quality checks</Text>

      <Text className="mb-1.5 text-[13px] font-semibold text-[#757575]">Centre</Text>
      <Menu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        anchor={
          <PaperButton mode="outlined" onPress={() => setMenuOpen(true)} style={{ marginBottom: 14 }}>
            {centreName}
          </PaperButton>
        }
      >
        {centres.map((c) => (
          <Menu.Item key={c.centre_id} title={c.name} onPress={() => { setCentreId(c.centre_id); setMenuOpen(false); }} />
        ))}
      </Menu>

      <Text className="mb-1.5 text-[13px] font-semibold text-[#757575]">Phone number</Text>
      <TextInput mode="outlined" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={{ marginBottom: 14 }} />

      <Text className="mb-1.5 text-[13px] font-semibold text-[#757575]">Password</Text>
      <TextInput mode="outlined" value={password} onChangeText={setPassword} secureTextEntry style={{ marginBottom: 14 }} />

      {error ? <Text className="mb-3 text-[#D32F2F]">{error}</Text> : null}

      <Button className="mb-3 mt-2 h-12 bg-[#1A4D3E]" onPress={login} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Login</Text>}
      </Button>
      <Button variant="ghost" onPress={() => navigation.goBack()}>
        <Text className="text-[#1A4D3E]">Back to main login</Text>
      </Button>
      <Text className="mt-4 text-xs leading-[18px] text-[#757575]">
        Demo: Kiambu Town Hall · {DEMO_AGENT_PHONE} · password {DEMO_PASSWORD}
      </Text>
    </ScrollView>
  );
}
