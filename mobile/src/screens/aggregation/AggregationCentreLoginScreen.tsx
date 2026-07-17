import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput, Button, Menu } from 'react-native-paper';
import { COLORS } from '../../constants';
import { aggregationCentreLogin, getAggregationCentres, setAuthToken } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { extractApiError } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'AggregationLogin'>;

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Aggregation Centre</Text>
      <Text style={styles.subtitle}>Staff login for delivery intake and quality checks</Text>

      <Text style={styles.label}>Centre</Text>
      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} anchor={
        <Button mode="outlined" onPress={() => setMenuOpen(true)} style={styles.input}>{centreName}</Button>
      }>
        {centres.map((c) => (
          <Menu.Item key={c.centre_id} title={c.name} onPress={() => { setCentreId(c.centre_id); setMenuOpen(false); }} />
        ))}
      </Menu>

      <Text style={styles.label}>Phone number</Text>
      <TextInput mode="outlined" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} />

      <Text style={styles.label}>Password</Text>
      <TextInput mode="outlined" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button mode="contained" onPress={login} loading={loading} buttonColor={COLORS.primary} style={styles.btn}>
        Login
      </Button>
      <Button mode="text" onPress={() => navigation.navigate('Login')}>Back to main login</Button>
      <Text style={styles.hint}>Demo: Kiambu Town Hall · {DEMO_AGENT_PHONE} · password {DEMO_PASSWORD}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 24 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginTop: 6, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 6 },
  input: { marginBottom: 14 },
  error: { color: COLORS.alert, marginBottom: 12 },
  btn: { marginTop: 8, marginBottom: 12 },
  hint: { fontSize: 12, color: COLORS.muted, marginTop: 16, lineHeight: 18 },
});
