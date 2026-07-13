import React from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';

interface KBSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function KBSearchBar({ value, onChangeText, placeholder = 'Search...' }: KBSearchBarProps) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={20} color={COLORS.muted} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={8}>
          <Ionicons name="close-circle" size={20} color={COLORS.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 12,
  },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: COLORS.text, paddingVertical: 10 },
});
