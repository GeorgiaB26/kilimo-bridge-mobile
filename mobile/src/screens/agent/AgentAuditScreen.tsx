import React, { useState, useEffect } from 'react';
import { View, FlatList } from 'react-native';
import { Text } from '@/components/ui/text';
import { api } from '../../api/client';

export function AgentAuditScreen() {
  const [logs, setLogs] = useState<Array<{ action: string; category: string; created_at: string; details: string }>>([]);

  useEffect(() => {
    api.get('/agents/audit').then((r) => setLogs(r.data.logs ?? [])).catch(() => {});
  }, []);

  return (
    <FlatList
      className="flex-1 p-4"
      data={logs}
      keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={
        <Text className="mb-4 text-[22px] font-bold text-[#1A4D3E]">My Activity Log</Text>
      }
      renderItem={({ item }) => (
        <View className="mb-1.5 rounded-lg bg-[#F9F9F9] p-3">
          <Text className="text-sm font-medium text-[#333333]">{item.action}</Text>
          <Text className="mt-0.5 text-xs text-[#757575]">{item.created_at}</Text>
        </View>
      )}
      ListEmptyComponent={
        <Text className="mt-8 text-center text-[#757575]">No activity logged yet</Text>
      }
    />
  );
}
