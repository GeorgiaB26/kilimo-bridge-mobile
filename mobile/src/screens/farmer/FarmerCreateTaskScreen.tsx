import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from 'react-native-paper';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { createFarmerPersonalTask } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import type { FarmerRootStackParamList } from '../../navigation/types';

type CreateNav = NativeStackNavigationProp<FarmerRootStackParamList, 'CreateTask'>;

type Priority = 'low' | 'normal' | 'high';

export function FarmerCreateTaskScreen() {
  const navigation = useNavigation<CreateNav>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [assignToSelf, setAssignToSelf] = useState(true);
  const [loading, setLoading] = useState(false);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs', { screen: 'Tasks' });
  };

  const createTask = async () => {
    if (!title.trim()) {
      showMessage('Required', 'Please enter a task title.');
      return;
    }
    if (!dueDate.trim()) {
      showMessage('Required', 'Please enter a due date (DD/MM/YYYY).');
      return;
    }

    setLoading(true);
    try {
      await createFarmerPersonalTask({
        name: title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate.trim(),
        priority,
        assign_to_self: assignToSelf,
      });
      showMessage('Task created', 'Your task has been added to your list.');
      goBack();
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not create task'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={goBack}>
          <Text className="text-sm font-semibold text-[#4472C4]">← Cancel</Text>
        </Pressable>
        <Text className="mt-2 text-xl font-bold text-foreground">Create task</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Task title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter task title"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Enter task description"
          placeholderTextColor="#999"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Due date (DD/MM/YYYY) *</Text>
        <TextInput
          style={styles.input}
          placeholder="01/12/2026"
          placeholderTextColor="#999"
          value={dueDate}
          onChangeText={setDueDate}
          editable={!loading}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Priority</Text>
        <View style={styles.priorityRow}>
          {(['low', 'normal', 'high'] as Priority[]).map((p) => (
            <Pressable
              key={p}
              style={[styles.priorityButton, priority === p && styles.priorityButtonActive]}
              onPress={() => setPriority(p)}
              disabled={loading}
            >
              <Text
                style={[
                  styles.priorityButtonText,
                  priority === p && styles.priorityButtonTextActive,
                ]}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Assign to myself</Text>
          <Switch value={assignToSelf} onValueChange={setAssignToSelf} disabled={loading} />
        </View>
      </View>

      <View style={styles.buttonWrap}>
        <Button
          mode="contained"
          onPress={createTask}
          loading={loading}
          buttonColor={COLORS.success}
          style={styles.createButton}
        >
          Create task
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    paddingBottom: 32,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginVertical: 8,
    marginHorizontal: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  labelSpaced: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1A1A1A',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    alignItems: 'center',
  },
  priorityButtonActive: {
    borderColor: '#4472C4',
    backgroundColor: '#E3F2FD',
  },
  priorityButtonText: {
    fontSize: 12,
    color: '#666666',
  },
  priorityButtonTextActive: {
    color: '#4472C4',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  buttonWrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createButton: {
    paddingVertical: 4,
  },
});
