import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextInput } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { selfRegister } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'FieldAgentRegistration'>;

export function FieldAgentRegistrationScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [governmentId, setGovernmentId] = useState('');
  const [sector, setSector] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [aggregationCenter, setAggregationCenter] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim() || !phone.trim() || !governmentId.trim()) {
      Alert.alert('Missing fields', 'Name, phone, and government ID are required.');
      return;
    }
    setLoading(true);
    try {
      const result = await selfRegister({
        userType: 'field_agent',
        name: name.trim(),
        phone: phone.trim(),
        governmentId: governmentId.trim(),
        region: region.trim() || sector.trim(),
        district: district.trim(),
        aggregationCenter: aggregationCenter.trim(),
        sector: sector.trim(),
      });
      Alert.alert('Registration submitted', result.message ?? 'Account created.', [
        { text: 'OK', onPress: () => navigation.getParent()?.goBack() },
      ]);
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text className="mb-4 text-lg font-bold text-[#1A4D3E]">Field agent registration</Text>
      <Text className="mb-4 text-sm text-[#757575]">
        Complete your details. Your account will be reviewed before you can log in.
      </Text>
      <TextInput label="Full name *" value={name} onChangeText={setName} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Government ID *" value={governmentId} onChangeText={setGovernmentId} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Sector" value={sector} onChangeText={setSector} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Area covering (region) *" value={region} onChangeText={setRegion} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="District *" value={district} onChangeText={setDistrict} mode="outlined" style={{ marginBottom: 12 }} />
      <TextInput label="Aggregation centre *" value={aggregationCenter} onChangeText={setAggregationCenter} mode="outlined" style={{ marginBottom: 16 }} />
      <Button className="h-12 bg-[#1A4D3E]" disabled={loading} onPress={submit}>
        <Text className="text-white">{loading ? 'Submitting…' : 'Submit registration'}</Text>
      </Button>
    </View>
  );
}
