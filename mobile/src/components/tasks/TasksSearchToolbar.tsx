import React from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';

type Props = {
  search: string;
  onSearchChange: (text: string) => void;
  searchPlaceholder?: string;
  filterButtons?: Array<{
    key: string;
    label: string;
    active?: boolean;
    onPress: () => void;
  }>;
};

export function TasksSearchToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search task, project, assignee or status',
  filterButtons,
}: Props) {
  const webPressable = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#757575" />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor="#999999"
          value={search}
          onChangeText={onSearchChange}
        />
      </View>
      {filterButtons && filterButtons.length > 0 ? (
        <View style={styles.filterRow}>
          {filterButtons.map((btn) => (
            <Pressable
              key={btn.key}
              onPress={btn.onPress}
              style={[styles.filterButton, btn.active && styles.filterButtonActive, webPressable]}
            >
              <Text style={styles.filterButtonText} numberOfLines={1}>{btn.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  filterButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 4,
    backgroundColor: '#FAFAFA',
  },
  filterButtonActive: {
    borderColor: '#4472C4',
    backgroundColor: '#E3F2FD',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#1A1A1A',
    textAlign: 'center',
  },
});
