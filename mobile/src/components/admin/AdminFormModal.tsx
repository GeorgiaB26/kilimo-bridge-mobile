import React, { useState } from 'react';
import {
  View, Text, Modal, StyleSheet, ScrollView, Pressable, TextInput as RNTextInput,
} from 'react-native';
import { Button } from 'react-native-paper';
import { COLORS } from '../../constants';

export interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
}

interface Props {
  visible: boolean;
  title: string;
  fields: FormField[];
  initialValues?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string;
}

export function AdminFormModal({
  visible, title, fields, initialValues, onClose, onSubmit, submitLabel = 'Save',
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      const init: Record<string, string> = {};
      for (const f of fields) {
        init[f.key] = initialValues?.[f.key] ?? '';
      }
      setValues(init);
    }
  }, [visible, fields, initialValues]);

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        return;
      }
    }
    setSaving(true);
    try {
      await onSubmit(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable onPress={onClose} style={styles.closeRow}>
            <Text style={styles.close}>✕ Close</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.fields}>
            {fields.map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.label}>
                  {f.label}{f.required ? ' *' : ''}
                </Text>
                <RNTextInput
                  style={[styles.input, f.multiline && styles.multiline]}
                  value={values[f.key] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                  placeholder={f.placeholder}
                  multiline={f.multiline}
                  numberOfLines={f.multiline ? 3 : 1}
                  keyboardType={f.keyboardType ?? 'default'}
                />
              </View>
            ))}
          </ScrollView>
          <Button mode="contained" onPress={submit} loading={saving} buttonColor={COLORS.primary}>
            {submitLabel}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: COLORS.background, borderRadius: 12, padding: 20, maxHeight: '85%' },
  closeRow: { alignSelf: 'flex-end' },
  close: { color: COLORS.muted, fontSize: 15 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.primary, marginBottom: 16 },
  fields: { marginBottom: 16 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: COLORS.surface,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
