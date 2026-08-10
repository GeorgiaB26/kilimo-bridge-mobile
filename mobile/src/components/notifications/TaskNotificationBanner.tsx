import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { formatMessageTime } from '../../constants/notifications';

export type TaskNotificationBannerItem = {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  context_type?: string | null;
  context_id?: string | null;
};

function iconAndColor(type: string): { icon: keyof typeof Ionicons.glyphMap; color: string } {
  const t = type.toLowerCase();
  if (t === 'success' || t === 'task_completed') {
    return { icon: 'checkmark-circle', color: COLORS.success };
  }
  if (t === 'warning') {
    return { icon: 'alert-circle', color: COLORS.warning };
  }
  return { icon: 'information-circle', color: COLORS.info };
}

export function TaskNotificationBanner({
  notification,
  onPress,
  onDismiss,
}: {
  notification: TaskNotificationBannerItem;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const { icon, color } = iconAndColor(notification.type);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.banner, { borderLeftColor: color }]}
      accessibilityRole="button"
    >
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={20} color={color} />
          <Text className="flex-1 text-sm font-bold" style={{ color }}>
            {notification.title}
          </Text>
        </View>
        <Text className="mt-1 text-sm text-foreground" style={styles.messageIndent}>
          {notification.message}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground" style={styles.messageIndent}>
          {formatMessageTime(notification.created_at)}
        </Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={22} color="#9ca3af" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderLeftWidth: 4,
    gap: 8,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageIndent: {
    marginLeft: 28,
  },
});
