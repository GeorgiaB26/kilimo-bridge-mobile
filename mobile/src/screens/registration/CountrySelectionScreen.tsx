import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { KilimoLogo } from '../../components/KilimoLogo';
import { COLORS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { useCurrency } from '../../context/CurrencyContext';
import { getCurrencyForCountry } from '../../utils/currencyMap';
import { COUNTRY_LIST } from '../../constants/regional';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Country'>;

export function CountrySelectionScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const { selectCountry } = useCurrency();
  const [error, setError] = useState('');

  const selectedCurrency = formData.country ? getCurrencyForCountry(formData.country) : null;

  const handleSelectCountry = async (countryName: string) => {
    const info = getCurrencyForCountry(countryName);
    updateForm({
      country: countryName,
      currency: info.code,
      district: '',
      subCounty: '',
      parish: '',
      village: '',
    });
    await selectCountry(countryName);
  };

  const handleNext = () => {
    if (!formData.country) {
      setError('Please select your country');
      return;
    }
    setError('');
    navigation.navigate('BasicInfo');
  };

  return (
    <View style={styles.container}>
      <KilimoLogo width={200} height={54} style={styles.logo} />
      <ScreenHeader title="Select Your Country" subtitle="Choose where you farm" />
      {selectedCurrency ? (
        <View style={styles.currencyBanner}>
          <Ionicons name="cash-outline" size={18} color={COLORS.primary} />
          <Text style={styles.currencyText}>
            Currency: <Text style={styles.currencyCode}>{selectedCurrency.code}</Text>
            {' · '}{selectedCurrency.name}
          </Text>
        </View>
      ) : null}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {COUNTRY_LIST.map((country) => {
          const selected = formData.country === country.name;
          const currency = getCurrencyForCountry(country.name);
          return (
            <Pressable
              key={country.code}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => handleSelectCountry(country.name)}
            >
              <View style={styles.optionContent}>
                <Text style={[styles.optionName, selected && styles.optionNameSelected]}>{country.name}</Text>
                <Text style={styles.optionHint}>
                  {country.levelLabels[0]} → {country.levelLabels[3]} · {currency.code}
                </Text>
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color={COLORS.border} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Next" onPress={handleNext} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logo: { marginBottom: 8 },
  currencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  currencyText: { fontSize: 14, color: COLORS.text, flex: 1 },
  currencyCode: { fontWeight: '700', color: COLORS.primary },
  list: { flex: 1, marginBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    backgroundColor: COLORS.background,
  },
  optionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5F0',
  },
  optionContent: { flex: 1 },
  optionName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  optionNameSelected: { color: COLORS.primary },
  optionHint: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  error: { color: COLORS.alert, marginBottom: 8, fontSize: 14 },
  button: { marginTop: 4 },
});
