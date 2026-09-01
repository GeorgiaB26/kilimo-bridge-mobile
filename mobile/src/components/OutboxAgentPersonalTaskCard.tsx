import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KBCard } from './ui/KBCard';
import type { PendingAgentPersonalTaskView } from '../services/submitAgentPersonalTaskOutbox';

type Props = {
  item: PendingAgentPersonalTaskView;
  pushing?: boolean;
  onPush?: () => void;
  onDismiss: () => void;
};

export function OutboxAgentPersonalTaskCard({ item, pushing, onPush, onDismiss }: Props) {
  const needsReview =
    item.kind === 'create'
      ? item.status === 'needs_review'
      : item.outboxStatus === 'needs_review';
  const title = item.kind === 'create' ? item.name : item.taskName;
  const subtitle =
    item.kind === 'create'
      ? `Queued create task · ${item.statusLabel}`
      : `Queued status → ${item.status.replace(/_/g, ' ')} · ${item.statusLabel}`;

  return (
    <KBCard elevated={false} style={{ marginBottom: 8 }}>
      <View className="flex-row items-start gap-2">
        <Ionicons
          name={needsReview ? 'alert-circle-outline' : 'cloud-offline-outline'}
          size={20}
          color={needsReview ? '#D32F2F' : '#FF9800'}
        />
        <View className="flex-1">
          <Text className="text-base font-semibold text-[#333333]">{title}</Text>
          <Text className="mt-0.5 text-[13px] text-[#757575]">{subtitle}</Text>
          <Text className="mt-0.5 text-[12px] text-[#757575]">
            Saved {new Date(item.createdAt).toLocaleString()}
          </Text>
          {needsReview ? (
            <Text className="mt-2 text-sm font-semibold text-[#D32F2F]">Needs your review</Text>
          ) : null}
          {item.syncError ? (
            <Text
              className={`mt-1 text-xs leading-[16px] ${needsReview ? 'text-[#D32F2F]' : 'text-[#757575]'}`}
            >
              {item.syncError}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {needsReview ? (
          <Button variant="outline" className="h-10" onPress={onDismiss}>
            <Text className="text-[#D32F2F]">Dismiss</Text>
          </Button>
        ) : (
          <>
            <Button className="h-10 bg-[#1A4D3E]" disabled={pushing} onPress={onPush}>
              {pushing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white">Push now</Text>
              )}
            </Button>
            <Button variant="outline" className="h-10" onPress={onDismiss} disabled={pushing}>
              <Text className="text-[#757575]">Discard</Text>
            </Button>
          </>
        )}
      </View>
    </KBCard>
  );
}
