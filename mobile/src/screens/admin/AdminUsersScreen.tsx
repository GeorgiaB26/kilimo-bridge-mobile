import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { getUsers } from '../../api/client';
import { useAuthStore, canManageUsers } from '../../store/authStore';
import { KBSearchBar } from '../../components/KBSearchBar';

const ROLE_COLORS: Record<string, string> = {
  platform_admin: '#D32F2F',
  super_admin: '#D32F2F',
  admin: '#1A4D3E',
  agent: '#1976D2',
  banking_agent: '#FF9800',
  banking_admin: '#FF9800',
  farmer: '#2E7D5E',
  field_officer: '#1976D2',
};

const SEARCH_MIN = 1;

export function AdminUsersScreen() {
  const user = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<Array<{
    name: string;
    phone_number: string;
    role: string;
    district?: string;
    status: string;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeSearch = debouncedSearch.length >= SEARCH_MIN ? debouncedSearch : undefined;

  const load = useCallback(async () => {
    if (!user?.role || !canManageUsers(user.role)) return;
    setLoading(true);
    try {
      const d = await getUsers(activeSearch);
      setUsers(d.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.role, activeSearch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!user?.role || !canManageUsers(user.role)) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-center text-base text-[#757575]">You don't have permission to view users.</Text>
      </View>
    );
  }

  const listHeader = (
    <View>
      <Text className="mb-1 text-[22px] font-bold text-[#1A4D3E]">
        Platform Users ({users.length.toLocaleString()})
      </Text>
      <KBSearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search name, phone, role, district..."
      />
      {searchQuery.length > 0 && searchQuery.length < SEARCH_MIN ? (
        <Text className="-mt-2 mb-2 text-xs text-[#757575]">
          Type at least {SEARCH_MIN} characters to search
        </Text>
      ) : null}
      {activeSearch ? (
        <Text className="mb-3 text-[13px] text-[#757575]">Results for "{activeSearch}"</Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-8"
      data={users}
      keyExtractor={(item) => item.phone_number}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <View className="mb-2 rounded-lg bg-[#F9F9F9] p-3.5">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-base font-semibold text-[#333333]">{item.name}</Text>
            <Text
              className="text-xs font-semibold capitalize"
              style={{ color: ROLE_COLORS[item.role] ?? '#757575' }}
            >
              {item.role.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text className="mt-1 text-[13px] text-[#757575]">{item.phone_number}</Text>
          {item.district ? (
            <Text className="mt-0.5 text-xs text-[#1976D2]">District: {item.district}</Text>
          ) : null}
        </View>
      )}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color="#1A4D3E" className="mt-6" />
        ) : (
          <Text className="mt-6 text-center italic text-[#757575]">
            {activeSearch ? `No users matching "${activeSearch}"` : 'No users found'}
          </Text>
        )
      }
    />
  );
}
