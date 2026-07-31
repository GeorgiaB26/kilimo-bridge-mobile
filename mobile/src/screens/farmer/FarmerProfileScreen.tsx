import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Divider, List, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { APP_BUILD } from '../../constants/build';
import { getFarmerDashboard } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { useAuthStore } from '../../store/authStore';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { getLocalizedGreeting } from '../../utils/greeting';
import { useCurrency } from '../../context/CurrencyContext';

export function FarmerProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { currency, currencyInfo, selectCountry } = useCurrency();
  const [farmer, setFarmer] = useState<{
    name: string;
    phone_number: string;
    country: string;
    district: string;
    sub_county: string;
    membership_group_name: string;
    aggregation_center: string | null;
    kb_farmer_id: string | null;
    picture_url: string | null;
    status: string;
  } | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFarmerDashboard().then((d) => {
      setFarmer(d.farmer);
      if (d.farmer?.country) selectCountry(d.farmer.country);
      setError(null);
    }).catch((err: unknown) => {
      setError(extractApiError(err, 'Could not load profile'));
    });
  }, [selectCountry]);

  const displayName = farmer?.name ?? user?.name ?? 'Farmer';
  const country = farmer?.country ?? 'Kenya';
  const greeting = getLocalizedGreeting(country, displayName);

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-10">
      {error ? <FarmerOfflineBanner message={error} /> : null}
      <View className="mb-5 items-center rounded-[20px] bg-[#1A4D3E] p-6 pt-5">
        <ProfileAvatar
          name={displayName}
          pictureUrl={farmer?.picture_url}
          size="hero"
        />
        <View className="mb-3 mt-3 w-full items-center rounded-xl bg-white/10 p-3.5">
          <Text className="text-center text-[22px] font-bold leading-[30px] text-white">{greeting.primary}</Text>
          <Text className="mt-1.5 text-center text-sm text-white/85">{greeting.secondary}</Text>
          <Text className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#D4AF6A]">{greeting.languageName}</Text>
        </View>
        <Text className="mt-1 text-2xl font-bold text-white">{displayName}</Text>
        <Text className="mb-3 mt-1 text-center text-sm text-white/80">
          {[farmer?.district, farmer?.sub_county, country].filter(Boolean).join(' · ')}
        </Text>
        <View className="flex-row items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5">
          <Ionicons name="shield-checkmark" size={14} color="#2E7D5E" />
          <Text className="text-xs font-semibold text-white">Verified Farmer</Text>
        </View>
        <Text className="mt-2.5 text-xs font-semibold text-[#D4AF6A]">{currencyInfo.name} ({currency})</Text>
      </View>

      {farmer?.kb_farmer_id ? (
        <>
          <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Kilimo Bridge ID</Text>
          <View className="mb-5 items-center rounded-xl bg-white p-4">
            <Text className="text-xl font-bold tracking-wide text-[#1A4D3E]">{farmer.kb_farmer_id}</Text>
          </View>
        </>
      ) : null}

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Contact</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <ProfileRow icon="call" label="Phone" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="business" label="Cooperative" value={farmer?.membership_group_name} />
        {farmer?.aggregation_center ? (
          <>
            <Divider />
            <ProfileRow icon="location" label="Aggregation centre" value={farmer.aggregation_center} />
          </>
        ) : null}
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Payment</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <ProfileRow icon="phone-portrait" label="M-Pesa" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="shield-checkmark" label="National ID" value="Verified" verified />
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Settings</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <List.Item
          title="Push notifications"
          left={(props) => <List.Icon {...props} icon="bell" color="#1A4D3E" />}
          right={() => (
            <Switch value={notifications} onValueChange={setNotifications} color="#1A4D3E" />
          )}
        />
      </View>

      <Button variant="outline" className="mt-2 border-[#D32F2F]" onPress={logout}>
        <Text className="text-[#D32F2F]">Sign Out</Text>
      </Button>
      <Text className="mt-4 text-center text-xs text-[#757575]">Kilimo Bridge {APP_BUILD}</Text>
    </ScrollView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  verified,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  verified?: boolean;
}) {
  return (
    <View className="flex-row items-center p-4">
      <Ionicons name={icon} size={20} color="#1A4D3E" style={{ marginRight: 12 }} />
      <View className="flex-1">
        <Text className="text-xs text-[#757575]">{label}</Text>
        <Text className="mt-0.5 text-[15px] font-medium text-[#333333]">{value ?? '—'}</Text>
      </View>
      {verified ? <Ionicons name="checkmark-circle" size={18} color="#2E7D5E" /> : null}
    </View>
  );
}
