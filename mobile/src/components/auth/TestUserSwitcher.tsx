import React from 'react';
import { View, Pressable } from 'react-native';
import { Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { TEST_SWITCHER_USERS, type TestSwitcherRole } from '../../constants/testUsers';

interface Props {
  loading?: boolean;
  onSelect: (role: TestSwitcherRole) => void;
}

export function TestUserSwitcher({ loading, onSelect }: Props) {
  return (
    <View className="mb-5 rounded-xl border-2 border-[#3b82f6] bg-[#f0f9ff] p-4">
      <View className="mb-1 flex-row items-center gap-1.5">
        <Lock size={16} color="#1e40af" />
        <Text className="text-sm font-bold text-[#1e40af]">Quick test login (dev mode)</Text>
      </View>
      <Text className="mb-3 text-xs text-[#0369a1]">Auto-authenticate — no OTP needed</Text>

      {(Object.keys(TEST_SWITCHER_USERS) as TestSwitcherRole[]).map((key) => {
        const user = TEST_SWITCHER_USERS[key];
        const Icon = user.Icon;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            disabled={loading}
            className="mb-2 rounded-lg border border-[#3b82f6] bg-[#dbeafe] p-3 active:opacity-80 opacity-100"
            style={{ opacity: loading ? 0.6 : 1 }}
            accessibilityLabel={user.label}
          >
            {loading ? null : (
              <>
                <View className="flex-row items-center gap-2">
                  <Icon size={16} color="#1e40af" />
                  <Text className="text-sm font-semibold text-[#1e40af]">{user.label}</Text>
                </View>
                <Text className="mt-1 text-xs text-[#0369a1]">
                  {user.phone} | Status: {user.statusLabel}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
