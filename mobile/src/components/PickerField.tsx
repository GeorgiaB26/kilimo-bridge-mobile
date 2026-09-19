import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { KeyboardBottomSheet } from './ui/KeyboardBottomSheet';

type Option = { label: string; value: string };

interface PickerFieldProps {
  label: string;
  value: string;
  options: string[] | { label: string; value: string }[];
  onSelect: (value: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
  /** Show a search box in the options modal (default: when there are 8+ options). */
  searchable?: boolean;
  /** If set, the field stays tappable with an empty list; search can add a name that is not in options. */
  onCreate?: (value: string) => void;
  createLabel?: string;
}

export function PickerField({
  label,
  value,
  options,
  onSelect,
  required,
  error,
  placeholder = 'Select...',
  searchable,
  onCreate,
  createLabel,
}: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0));

  const normalized = useMemo<Option[]>(
    () => options.map((o) => (typeof o === 'string' ? { label: o || 'None', value: o } : o)),
    [options]
  );

  const canOpen = normalized.length > 0 || !!onCreate;
  const showSearch = searchable ?? (normalized.length >= 8 || !!onCreate);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [normalized, query]);

  const selectedLabel =
    normalized.find((opt) => opt.value === value)?.label ?? (value || '');

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const handleSelect = (next: string) => {
    onSelect(next);
    close();
  };

  const queryTrimmed = query.trim();
  const exactMatch = useMemo(() => {
    const q = queryTrimmed.toLowerCase();
    if (!q) return false;
    return normalized.some(
      (opt) => opt.label.toLowerCase() === q || opt.value.toLowerCase() === q
    );
  }, [normalized, queryTrimmed]);

  const handleCreate = () => {
    if (!onCreate || !queryTrimmed || exactMatch) return;
    onCreate(queryTrimmed);
    close();
  };

  const sheetHeaderHeight = showSearch ? 116 : 52;
  const listMaxHeight = useMemo(() => {
    const sheetCap = windowHeight * 0.75;
    if (keyboardHeight > 0) {
      // Sheet is lifted by KeyboardBottomSheet; shrink the list to the space above the keyboard.
      return Math.max(120, windowHeight - keyboardHeight - sheetHeaderHeight - 16);
    }
    return Math.max(160, sheetCap - sheetHeaderHeight - insets.bottom);
  }, [windowHeight, keyboardHeight, sheetHeaderHeight, insets.bottom]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel || placeholder}`}
        onPress={() => {
          if (!canOpen) return;
          setOpen(true);
        }}
        style={[
          styles.field,
          error ? styles.fieldError : null,
          !canOpen ? styles.fieldDisabled : null,
          Platform.OS === 'web' ? ({ cursor: canOpen ? 'pointer' : 'default' } as object) : null,
        ]}
      >
        <Text
          style={[styles.fieldText, !selectedLabel ? styles.fieldPlaceholder : null]}
          numberOfLines={1}
        >
          {selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.muted} />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <KeyboardBottomSheet
        visible={open}
        onRequestClose={close}
        sheetStyle={styles.sheet}
        sheetClassName="rounded-t-2xl bg-white"
        header={
          <>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </Pressable>
            </View>

            {showSearch ? (
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={COLORS.muted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  placeholderTextColor={COLORS.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
              </View>
            ) : null}
          </>
        }
      >
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => `${item.value}-${index}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={[styles.list, { maxHeight: listMaxHeight }]}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            onCreate ? (
              <Text style={styles.empty}>
                {queryTrimmed
                  ? 'No matches. Add this name below.'
                  : 'No verified options yet. Type a name to add it.'}
              </Text>
            ) : (
              <Text style={styles.empty}>No matches. Try a different search.</Text>
            )
          }
          ListFooterComponent={
            onCreate && queryTrimmed && !exactMatch ? (
              <Pressable onPress={handleCreate} style={styles.createOption}>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.createOptionText} numberOfLines={2}>
                  {createLabel ?? `Add “${queryTrimmed}”`}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const selected = item.value === value;
            return (
              <Pressable
                onPress={() => handleSelect(item.value)}
                style={[styles.option, selected ? styles.optionSelected : null]}
              >
                <Text
                  style={[styles.optionText, selected ? styles.optionTextSelected : null]}
                  numberOfLines={2}
                >
                  {item.label}
                </Text>
                {selected ? (
                  <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </KeyboardBottomSheet>
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
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldError: {
    borderColor: COLORS.alert,
  },
  fieldDisabled: {
    opacity: 0.55,
  },
  fieldText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  fieldPlaceholder: {
    color: COLORS.muted,
  },
  error: {
    color: COLORS.alert,
    fontSize: 12,
    marginTop: 4,
  },
  sheet: {
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: COLORS.text,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEEEEE',
  },
  optionSelected: {
    backgroundColor: '#E8F5F0',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
  },
  createOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEEEEE',
    backgroundColor: '#E8F5F0',
  },
  createOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
