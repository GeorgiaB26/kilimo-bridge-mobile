import React from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '../../store/authStore';

export function AdminProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <View className="flex-1 p-4">
      <View className="mb-3 h-20 w-20 items-center justify-center self-center rounded-full bg-[#1A4D3E]">
        <Text className="text-[28px] font-bold text-[#D4AF6A]">
          {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <Text className="text-center text-[22px] font-bold text-[#333333]">{user?.name}</Text>
      <Text className="mb-5 text-center text-sm capitalize text-[#757575]">
        {user?.role?.replace('_', ' ')}
      </Text>
      <View className="mb-5 rounded-lg bg-[#F9F9F9] p-4">
        <Row label="Phone" value={user?.phoneNumber} />
        {user?.district ? <Row label="District" value={user.district} /> : null}
      </View>
      <Text className="mb-2 text-base font-semibold text-[#1A4D3E]">Your permissions</Text>
      {getPermissions(user?.role).map((p) => (
        <View key={p} className="mb-1 flex-row items-center gap-1.5">
          <Check size={14} color="#333333" />
          <Text className="text-sm text-[#333333]">{p}</Text>
        </View>
      ))}
      <Button variant="outline" className="mt-6" onPress={logout}>
        <Text>Sign Out</Text>
      </Button>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-[#757575]">{label}</Text>
      <Text className="font-medium text-[#333333]">{value}</Text>
    </View>
  );
}

function getPermissions(role?: string): string[] {
  switch (role) {
    case 'platform_admin':
      return ['Full platform access', 'Manage all users including super admins', 'CSV import', 'View all farmers', 'Banking oversight', 'Audit logs'];
    case 'super_admin':
      return ['Create sectors, programs, projects & tasks', 'Approve farmer registrations', 'Assign field agents', 'View all regional data', 'Generate reports', 'Manage staff users'];
    case 'admin':
      return ['Regional farmer approval & assignment', 'Task tracking in assigned region', 'CSV import (regional)', 'View regional farmers', 'Manage regional users'];
    case 'agent':
      return ['Register farmers', 'View regional farmers', 'Payment verification', 'Activity audit log'];
    case 'banking_admin':
      return ['View payment processing status', 'Manage banking agent accounts', 'Financial audit trail'];
    case 'banking_agent':
      return ['View assigned payment transactions', 'Process M-Pesa via Equity H2H', 'Financial audit trail'];
    case 'farmer':
      return ['View own profile', 'View own projects', 'View own payments'];
    default:
      return [];
  }
}
