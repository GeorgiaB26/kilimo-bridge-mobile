import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { requestOtp } from '../../api/client';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number');
      return;
    }
    setLoading(true);
    try {
      const result = await requestOtp(phone);
      navigation.navigate('Otp', {
        phone,
        devCode: result.devCode,
      });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message
          ?? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to send OTP';
      Alert.alert('Error', msg ?? 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Kilimo Bridge"
        subtitle="Sign in with your phone number"
      />
      <View style={styles.card}>
        <Text style={styles.hint}>
          Farmers, admins, and field officers all sign in here with their registered phone number.
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
      <View style={styles.demoBox}>
        <Text style={styles.demoTitle}>Demo accounts (OTP: 123456)</Text>
        <Text style={styles.demoItem}>Admin: +254700000002</Text>
        <Text style={styles.demoItem}>Field Officer: +254700000003</Text>
        <Text style={styles.demoItem}>Farmer: +254712345678</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  hint: { fontSize: 14, color: COLORS.muted, marginBottom: 16, lineHeight: 20 },
  demoBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  demoTitle: { fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  demoItem: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
});
