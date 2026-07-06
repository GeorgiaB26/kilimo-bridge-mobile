import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../constants';

interface PickerFieldProps {
  label: string;
  value: string;
  options: string[] | { label: string; value: string }[];
  onSelect: (value: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
}

export function PickerField({
  label,
  value,
  options,
  onSelect,
  required,
  error,
  placeholder = 'Select...',
}: PickerFieldProps) {
  const normalized = options.map((o) =>
    typeof o === 'string' ? { label: o, value: o } : o
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {normalized.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, value === opt.value && styles.chipSelected]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={[styles.chipText, value === opt.value && styles.chipTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {!value && placeholder ? (
        <Text style={styles.placeholder}>{placeholder}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  required: {
    color: COLORS.alert,
  },
  scroll: {
    flexGrow: 0,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: COLORS.background,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.text,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  placeholder: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  error: {
    color: COLORS.alert,
    fontSize: 12,
    marginTop: 4,
  },
});
