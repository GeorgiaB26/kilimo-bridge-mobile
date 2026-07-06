import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';

export function AccountSwitcherBar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const roleLabel = user.role.replace('_', ' ');

  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={1}>
        Signed in as <Text style={styles.name}>{user.name}</Text> ({roleLabel})
      </Text>
      <TouchableOpacity onPress={logout} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Switch account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  text: { flex: 1, fontSize: 12, color: COLORS.text },
  name: { fontWeight: '700' },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
