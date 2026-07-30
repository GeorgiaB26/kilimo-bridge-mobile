import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface ProfileVerifiedBadgeProps {
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  readOnly?: boolean;
  activated?: boolean;
}

export function ProfileVerifiedBadge({
  verifiedBy,
  verifiedAt,
  readOnly = true,
  activated = false,
}: ProfileVerifiedBadgeProps) {
  return (
    <View style={styles.wrap}>
      {readOnly ? (
        <View style={styles.row}>
          <Ionicons name="lock-closed" size={14} color={COLORS.muted} />
          <Text style={styles.muted}>Profile is read-only — contact your cooperative to update</Text>
        </View>
      ) : null}
      {verifiedBy ? (
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
          <Text style={styles.badgeText}>
            Verified by {verifiedBy}
            {verifiedAt ? ` · ${new Date(verifiedAt).toLocaleDateString()}` : ''}
          </Text>
        </View>
      ) : null}
      {!activated ? (
        <View style={[styles.badge, styles.pending]}>
          <Text style={styles.pendingText}>Activation pending — complete payment to access all features</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 12, color: COLORS.muted, flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
  },
  badgeText: { fontSize: 13, color: COLORS.success, flex: 1 },
  pending: { backgroundColor: '#FFF3E0' },
  pendingText: { fontSize: 13, color: COLORS.warning },
});
