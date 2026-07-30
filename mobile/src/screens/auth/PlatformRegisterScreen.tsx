import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput, Button, Surface } from 'react-native-paper';
import { COLORS, DISTRICTS } from '../../constants';
import { PickerField } from '../../components/PickerField';
import { registerPlatformUser, requestOtp } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'PlatformRegister'>;

const ROLE_OPTIONS = [
  { label: 'Farmer', value: 'farmer' },
  { label: 'Field Agent', value: 'agent' },
  { label: 'Banking Officer', value: 'banking' },
];

export function PlatformRegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('farmer');
  const [district, setDistrict] = useState('');
  const [aggregationCenter, setAggregationCenter] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isAgent = role === 'agent';
  const isBanking = role === 'banking';

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      showMessage('Missing fields', 'Enter your name and phone number');
      return;
    }
    setLoading(true);
    try {
      await registerPlatformUser({
        name: name.trim(),
        phone: phone.trim(),
        role,
        district: isAgent ? district : undefined,
        region: isAgent ? district : undefined,
        aggregationCenter: isAgent ? aggregationCenter.trim() : undefined,
        password: isBanking ? password : undefined,
      });
      const otp = await requestOtp(phone.trim());
      showMessage('Account created', 'Verify OTP to sign in');
      navigation.navigate('Otp', { phone: phone.trim(), devCode: otp.devCode });
    } catch (err: unknown) {
      showMessage('Registration failed', extractApiError(err, 'Could not create account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create platform account</Text>
      <Text style={styles.subtitle}>
        Register to sign in as farmer, field agent, or banking officer. Admin staff accounts are
        created separately.
      </Text>

      <Surface style={styles.card} elevation={1}>
        <PickerField
          label="I am a"
          value={role}
          options={ROLE_OPTIONS}
          onSelect={setRole}
          required
        />

        <TextInput
          label="Full name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
          outlineColor={COLORS.border}
          activeOutlineColor={COLORS.primary}
        />

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

        {isAgent ? (
          <>
            <PickerField
              label="District"
              value={district}
              options={DISTRICTS}
              onSelect={setDistrict}
              required
            />
            <TextInput
              label="Aggregation centre"
              value={aggregationCenter}
              onChangeText={setAggregationCenter}
              mode="outlined"
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          </>
        ) : null}

        {isBanking ? (
          <TextInput
            label="Password (min 8 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            mode="outlined"
            style={styles.input}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
          />
        ) : null}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          buttonColor={COLORS.primary}
          style={styles.btn}
          contentStyle={styles.btnContent}
        >
          Create account
        </Button>

        <Button mode="text" onPress={() => navigation.navigate('Login')} textColor={COLORS.muted}>
          Back to sign in
        </Button>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.muted, lineHeight: 20, marginBottom: 20 },
  card: { padding: 20, borderRadius: 16, backgroundColor: COLORS.background },
  input: { marginBottom: 12, backgroundColor: COLORS.background },
  btn: { borderRadius: 12, marginTop: 8 },
  btnContent: { minHeight: 48 },
});
