import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { COLORS } from '../constants';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export function FormField({ label, error, required, ...props }: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={COLORS.muted}
        {...props}
      />
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
    marginBottom: 6,
  },
  required: {
    color: COLORS.alert,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    minHeight: 48,
  },
  inputError: {
    borderColor: COLORS.alert,
  },
  error: {
    color: COLORS.alert,
    fontSize: 12,
    marginTop: 4,
  },
});
