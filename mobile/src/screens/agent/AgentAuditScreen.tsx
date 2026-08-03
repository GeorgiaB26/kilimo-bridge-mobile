import React, { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';
import {
  formatAgentAuditEntry,
  groupAuditByDate,
} from '../../utils/agentAuditLabels';

type LogRow = {
  action: string;
  category: string;
  created_at: string;
  details?: string | Record<string, unknown> | null;
  resource_type?: string;
};

export function AgentAuditScreen() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/agents/audit');
      setLogs(r.data.logs ?? []);
    } catch {
      setLogs([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = logs.filter((log) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const formatted = formatAgentAuditEntry(log);
    return (
      formatted.title.toLowerCase().includes(q) ||
      (formatted.subtitle?.toLowerCase().includes(q) ?? false)
    );
  });

  const grouped = groupAuditByDate(filtered);

  return (
    <FlatList
      className="flex-1 bg-[#F5F5F5]"
      contentContainerClassName="p-4 pb-10"
      data={grouped}
      keyExtractor={(item) => item.label}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View className="mb-4">
          <Text className="mb-3 text-[22px] font-bold text-[#1A4D3E]">Activity log</Text>
          <View className="flex-row items-center rounded-lg bg-white px-3">
            <Ionicons name="search" size={18} color="#757575" />
            <TextInput
              className="flex-1 py-2 pl-2"
              placeholder="Search activity"
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>
      }
      renderItem={({ item: group }) => (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#757575]">
            {group.label}
          </Text>
          {group.items.map((log, i) => {
            const entry = formatAgentAuditEntry(log as LogRow);
            return (
              <View key={`${group.label}-${i}`} className="mb-2 rounded-xl bg-white p-3">
                <Text className="text-sm font-medium text-[#333333]">
                  {entry.icon} {entry.title}
                </Text>
                {entry.subtitle ? (
                  <Text className="mt-0.5 text-xs text-[#757575]">{entry.subtitle}</Text>
                ) : null}
                <Text className="mt-1 text-xs text-[#757575]">{entry.time}</Text>
              </View>
            );
          })}
        </View>
      )}
      ListEmptyComponent={
        <Text className="mt-8 text-center text-[#757575]">No activity logged yet</Text>
      }
    />
  );
}
