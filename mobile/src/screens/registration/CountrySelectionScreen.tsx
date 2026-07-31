import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ScreenHeader } from '../../components/ScreenHeader';
import { KilimoLogo } from '../../components/KilimoLogo';
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
    <View className="flex-1">
      <KilimoLogo width={200} height={54} style={{ marginBottom: 8 }} />
      <ScreenHeader title="Select Your Country" subtitle="Choose where you farm" />
      {selectedCurrency ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-lg bg-[#E8F5F0] p-3">
          <Ionicons name="cash-outline" size={18} color="#1A4D3E" />
          <Text className="flex-1 text-sm text-[#333333]">
            Currency: <Text className="font-bold text-[#1A4D3E]">{selectedCurrency.code}</Text>
            {' · '}{selectedCurrency.name}
          </Text>
        </View>
      ) : null}
      <ScrollView className="mb-2 flex-1" showsVerticalScrollIndicator={false}>
        {COUNTRY_LIST.map((country) => {
          const selected = formData.country === country.name;
          const currency = getCurrencyForCountry(country.name);
          return (
            <Pressable
              key={country.code}
              className={cn(
                'mb-2 flex-row items-center rounded-[10px] border bg-white p-3.5',
                selected ? 'border-[#1A4D3E] bg-[#E8F5F0]' : 'border-[#E0E0E0]'
              )}
              onPress={() => handleSelectCountry(country.name)}
            >
              <View className="flex-1">
                <Text className={cn('text-base font-semibold text-[#333333]', selected && 'text-[#1A4D3E]')}>
                  {country.name}
                </Text>
                <Text className="mt-0.5 text-xs text-[#757575]">
                  {country.levelLabels[0]} → {country.levelLabels[3]} · {currency.code}
                </Text>
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={24} color="#1A4D3E" />
              ) : (
                <Ionicons name="ellipse-outline" size={24} color="#E0E0E0" />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {error ? <Text className="mb-2 text-sm text-[#D32F2F]">{error}</Text> : null}
      <Button className="mt-1 h-12 bg-[#1A4D3E]" onPress={handleNext}>
        <Text className="text-white">Next</Text>
      </Button>
    </View>
  );
}
