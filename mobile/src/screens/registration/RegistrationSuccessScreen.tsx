import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { COLORS } from '../../constants';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Success'>;

export function RegistrationSuccessScreen({ route, navigation }: Props) {
  const { farmerId, farmerName, phone } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={72} color={COLORS.success} />
      </View>
      <Text style={styles.title}>Farmer registered!</Text>
      <Text style={styles.subtitle}>
        {farmerName} is queued for cooperative verification. An SMS will be sent when approved.
      </Text>

      <View style={styles.idCard}>
        <Text style={styles.idLabel}>Kilimo Bridge Farmer ID</Text>
        <Text style={styles.idValue}>{farmerId}</Text>
        <Text style={styles.phone}>{phone}</Text>
      </View>

      <Text style={styles.hint}>
        Share this ID with the farmer. Profile changes require field agent review.
      </Text>

      <Button
        title="Register another farmer"
        onPress={() => navigation.popToTop()}
        style={styles.btn}
      />
      <Button
        title="Done"
        variant="outline"
        onPress={() => navigation.getParent()?.goBack()}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  subtitle: { fontSize: 15, color: COLORS.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  idCard: {
    marginTop: 28,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  idLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  idValue: { color: COLORS.accent, fontSize: 22, fontWeight: '800', marginTop: 8, letterSpacing: 1 },
  phone: { color: '#fff', marginTop: 8, fontSize: 14 },
  hint: { fontSize: 13, color: COLORS.muted, textAlign: 'center', marginTop: 20, lineHeight: 20 },
  btn: { width: '100%', marginTop: 12 },
});
