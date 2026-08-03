import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { selfRegister } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'StaffRegistration'>;

export function StaffRegistrationScreen({ route, navigation }: Props) {
  const isPm = route.params.variant === 'project_manager';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Name, phone, and password are required.');
      return;
    }
    setLoading(true);
    try {
      const result = await selfRegister({
        userType: route.params.variant,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password: password.trim(),
        region: region.trim() || undefined,
        district: district.trim() || undefined,
      });
      Alert.alert(
        isPm ? 'Awaiting approval' : 'Account created',
        result.message ?? 'Registration complete.',
        [{ text: 'OK', onPress: () => navigation.getParent()?.goBack() }]
      );
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text className="mb-2 text-lg font-bold text-[#1A4D3E]">
        {isPm ? 'Project manager registration' : 'Admin registration'}
      </Text>
      {isPm ? (
        <Text className="mb-4 text-sm text-[#757575]">
          Your account will be reviewed by the tech team. You will receive an approval notification via email.
        </Text>
      ) : (
        <Text className="mb-4 text-sm text-[#757575]">
          Sign up with phone and password. Email is optional for contact purposes.
        </Text>
      )}
      <TextInput label="Full name *" value={name} onChangeText={setName} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Password *" value={password} onChangeText={setPassword} secureTextEntry mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Region / company" value={region} onChangeText={setRegion} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="District" value={district} onChangeText={setDistrict} mode="outlined" style={{ marginBottom: 16 }} />
      <Button className="h-12 bg-[#1A4D3E]" disabled={loading} onPress={submit}>
        <Text className="text-white">{loading ? 'Submitting…' : 'Create account'}</Text>
      </Button>
    </View>
  );
}
