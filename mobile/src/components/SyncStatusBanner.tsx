import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { syncManager } from '../sync/SyncManager';
import type { SyncState } from '../db/localSchema';

const ICON_MAP: Record<string, string> = {
  synced: 'checkmark-circle',
  syncing: 'sync',
  offline: 'cloud-offline-outline',
  error: 'alert-circle',
  idle: 'ellipse-outline',
};

const COLOR_MAP: Record<string, string> = {
  synced: COLORS.success,
  syncing: COLORS.info,
  offline: COLORS.warning,
  error: COLORS.alert,
  idle: COLORS.muted,
};

export function SyncStatusBanner() {
  const [state, setState] = useState<SyncState>(syncManager.getState());

  useEffect(() => {
    return syncManager.subscribe(setState);
  }, []);

  if (state.status === 'idle' && !state.pendingCount) return null;

  const icon = ICON_MAP[state.status] ?? 'ellipse-outline';
  const color = COLOR_MAP[state.status] ?? COLORS.muted;

  return (
    <Pressable style={styles.banner} onPress={() => syncManager.runSync('manual')}>
      <Ionicons name={icon as 'checkmark-circle'} size={18} color={color} />
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color }]}>{state.message}</Text>
        {state.pendingCount > 0 ? (
          <Text style={styles.meta}>{state.pendingCount} pending</Text>
        ) : null}
      </View>
      <Ionicons name="refresh" size={16} color={COLORS.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textWrap: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, color: COLORS.muted },
});
