import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COUNTRY_CURRENCY_MAP,
  DEFAULT_COUNTRY,
  formatCurrency,
  getCurrencyForCountry,
  type CurrencyInfo,
} from '../utils/currencyMap';

const STORAGE_COUNTRY = 'selectedCountry';
const STORAGE_CURRENCY = 'selectedCurrency';
const STORAGE_LOCALE = 'selectedCurrencyLocale';

interface CurrencyContextValue {
  country: string;
  currency: string;
  currencyLocale: string;
  currencyInfo: CurrencyInfo;
  selectCountry: (countryName: string) => Promise<void>;
  formatAmount: (amount: number) => string;
  formatPayment: (amount: number, method?: string) => string;
  isReady: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [currencyInfo, setCurrencyInfo] = useState<CurrencyInfo>(
    getCurrencyForCountry(DEFAULT_COUNTRY)
  );
  const [isReady, setIsReady] = useState(false);

  const applyCountry = useCallback(async (countryName: string) => {
    const info = getCurrencyForCountry(countryName);
    setCountry(countryName);
    setCurrencyInfo(info);
    await AsyncStorage.multiSet([
      [STORAGE_COUNTRY, countryName],
      [STORAGE_CURRENCY, info.code],
      [STORAGE_LOCALE, info.locale],
    ]);
  }, []);

  const loadSavedCurrency = useCallback(async () => {
    try {
      const savedCountry = await AsyncStorage.getItem(STORAGE_COUNTRY);
      if (savedCountry && COUNTRY_CURRENCY_MAP[savedCountry]) {
        const info = getCurrencyForCountry(savedCountry);
        setCountry(savedCountry);
        setCurrencyInfo(info);
      }
    } catch {
      // keep defaults
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    loadSavedCurrency();
  }, [loadSavedCurrency]);

  const formatAmount = useCallback(
    (amount: number) => formatCurrency(amount, currencyInfo.code, currencyInfo.locale),
    [currencyInfo]
  );

  const formatPayment = useCallback(
    (amount: number, method = 'M-Pesa') => `Pay ${formatAmount(amount)} via ${method}`,
    [formatAmount]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      country,
      currency: currencyInfo.code,
      currencyLocale: currencyInfo.locale,
      currencyInfo,
      selectCountry: applyCountry,
      formatAmount,
      formatPayment,
      isReady,
    }),
    [country, currencyInfo, applyCountry, formatAmount, formatPayment, isReady]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return ctx;
}
