import React, { useMemo, useState } from 'react';
import {
  View,
  Pressable,
  Platform,
  TextInput as RNTextInput,
  ActivityIndicator,
  StyleSheet,
  Text as RNText,
} from 'react-native';
import { Square, SquareCheck, X } from 'lucide-react-native';
import { TextInput } from 'react-native-paper';
import { Text } from '@/components/ui/text';
import { KeyboardBottomSheet } from '@/components/ui/KeyboardBottomSheet';
import { maskDdMmYyyyInput, parseAgentTaskDueDateInput, DISPLAY_DATE_FORMAT } from '../../utils/agentTaskDate';
import { extractApiError, showMessage } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';

interface FarmerOption {
  farmer_id: string;
  name: string;
}

type AssignMode = 'self' | 'farmers';

interface Props {
  visible: boolean;
  farmers: FarmerOption[];
  loading?: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    due_date: string;
    priority: string;
    assigned_farmers?: string[];
  }) => Promise<void>;
}

const webOverlay =
  Platform.OS === 'web'
    ? ({
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
      })
    : undefined;

export function AddAgentTaskModal({ visible, farmers, loading, onClose, onSubmit }: Props) {
  const agentName = useAuthStore((s) => s.user?.name) ?? 'You';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [assignMode, setAssignMode] = useState<AssignMode>('self');
  const [selectedFarmers, setSelectedFarmers] = useState<string[]>([]);
  const [farmerSearch, setFarmerSearch] = useState('');
  const [formError, setFormError] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setAssignMode('self');
    setSelectedFarmers([]);
    setFarmerSearch('');
    setFormError('');
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const toggleFarmer = (id: string) => {
    setSelectedFarmers((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const filteredFarmers = useMemo(() => {
    const q = farmerSearch.trim().toLowerCase();
    if (!q) return farmers;
    return farmers.filter((f) => f.name.toLowerCase().includes(q));
  }, [farmers, farmerSearch]);

  const handleSubmit = async () => {
    setFormError('');

    if (!name.trim()) {
      const msg = 'Enter a name for this task.';
      setFormError(msg);
      showMessage('Task name required', msg);
      return;
    }
    if (!dueDate.trim()) {
      const msg = `Enter a due date as ${DISPLAY_DATE_FORMAT} (e.g. 20-08-2026).`;
      setFormError(msg);
      showMessage('Due date required', msg);
      return;
    }
    const normalizedDue = /^\d{8}$/.test(dueDate.replace(/\D/g, ''))
      ? maskDdMmYyyyInput(dueDate.replace(/\D/g, ''))
      : dueDate;
    const isoDue = parseAgentTaskDueDateInput(normalizedDue);
    if (!isoDue) {
      const msg = `Use ${DISPLAY_DATE_FORMAT} format, e.g. 20-08-2026 for 20 August 2026.`;
      setFormError(msg);
      showMessage('Invalid date', msg);
      return;
    }
    if (assignMode === 'farmers' && selectedFarmers.length === 0) {
      const msg = 'Choose at least one farmer, or switch to Myself.';
      setFormError(msg);
      showMessage('Select farmers', msg);
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        due_date: isoDue,
        priority,
        assigned_farmers: assignMode === 'farmers' ? selectedFarmers : undefined,
      });
      reset();
      onClose();
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Could not create task');
      setFormError(msg);
      showMessage('Could not create task', msg);
    }
  };

  return (
    <KeyboardBottomSheet
      visible={visible}
      onRequestClose={handleClose}
      scrollable
      backdropPressDisabled={loading}
      avoidingViewStyle={webOverlay}
      scrollViewProps={{
        className: 'px-5',
        keyboardShouldPersistTaps: 'always',
        contentContainerStyle: styles.scrollContent,
      }}
      header={
        <View className="flex-row items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
          <Text className="text-lg font-bold text-[#333333]">Create task</Text>
          <Pressable onPress={handleClose} hitSlop={12} disabled={loading}>
            <X size={24} color="#757575" />
          </Pressable>
        </View>
      }
      footer={
        <View style={styles.footerRow} collapsable={false}>
          <View
            collapsable={false}
            style={[styles.createWrap, loading && styles.createWrapDisabled]}
          >
            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Create task"
              style={({ pressed }) => [
                styles.createHit,
                pressed && !loading && styles.createHitPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <RNText style={styles.createText}>Create task</RNText>
              )}
            </Pressable>
          </View>
          <View collapsable={false} style={styles.cancelWrap}>
            <Pressable
              onPress={handleClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.cancelHit, pressed && styles.cancelHitPressed]}
            >
              <RNText style={styles.cancelText}>Cancel</RNText>
            </Pressable>
          </View>
        </View>
      }
    >
            <Text className="mb-1 mt-3 text-sm font-semibold text-[#333333]">Task name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Inspect water storage"
              mode="outlined"
              style={{ marginBottom: 12, backgroundColor: '#fff' }}
            />
            <Text className="mb-1 text-sm font-semibold text-[#333333]">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              mode="outlined"
              style={{ marginBottom: 12, backgroundColor: '#fff' }}
            />
            <Text className="mb-1 text-sm font-semibold text-[#333333]">Due date * ({DISPLAY_DATE_FORMAT})</Text>
            <TextInput
              value={dueDate}
              onChangeText={(text) => setDueDate(maskDdMmYyyyInput(text))}
              placeholder="20-08-2026"
              keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
              mode="outlined"
              style={{ marginBottom: 4, backgroundColor: '#fff' }}
            />
            <Text className="mb-3 text-xs text-[#757575]">
              Example: 20-08-2026 for 20 August 2026
            </Text>
            <Text className="mb-2 text-sm font-semibold text-[#333333]">Priority</Text>
            <View className="mb-3 flex-row gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setPriority(p)}
                  className={`rounded-lg px-3 py-2 ${priority === p ? 'bg-[#1A4D3E]' : 'bg-[#F0F0F0]'}`}
                >
                  <Text className={priority === p ? 'text-white' : 'text-[#333333]'}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mb-2 text-sm font-semibold text-[#333333]">Assign to *</Text>
            <View className="mb-3 flex-row gap-2">
              <Pressable
                onPress={() => {
                  setAssignMode('self');
                  setSelectedFarmers([]);
                }}
                className={`flex-1 rounded-lg px-3 py-3 ${assignMode === 'self' ? 'bg-[#1A4D3E]' : 'bg-[#F0F0F0]'}`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${assignMode === 'self' ? 'text-white' : 'text-[#333333]'}`}
                >
                  Myself
                </Text>
                <Text
                  className={`mt-0.5 text-center text-xs ${assignMode === 'self' ? 'text-white/90' : 'text-[#757575]'}`}
                >
                  {agentName}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAssignMode('farmers')}
                className={`flex-1 rounded-lg px-3 py-3 ${assignMode === 'farmers' ? 'bg-[#1A4D3E]' : 'bg-[#F0F0F0]'}`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${assignMode === 'farmers' ? 'text-white' : 'text-[#333333]'}`}
                >
                  Farmer(s)
                </Text>
                <Text
                  className={`mt-0.5 text-center text-xs ${assignMode === 'farmers' ? 'text-white/90' : 'text-[#757575]'}`}
                >
                  Select from your list
                </Text>
              </Pressable>
            </View>

            {assignMode === 'farmers' ? (
              <>
                {farmers.length === 0 ? (
                  <Text className="mb-3 text-sm text-[#757575]">
                    No farmers in your region yet. Register farmers first, or assign the task to
                    yourself.
                  </Text>
                ) : (
                  <>
                    <RNTextInput
                      className="mb-2 rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-sm"
                      placeholder="Search farmers"
                      value={farmerSearch}
                      onChangeText={setFarmerSearch}
                    />
                    <Text className="mb-2 text-sm font-semibold text-[#333333]">
                      Select farmers ({selectedFarmers.length} selected)
                    </Text>
                    {filteredFarmers.slice(0, 30).map((f) => {
                      const selected = selectedFarmers.includes(f.farmer_id);
                      const FarmerIcon = selected ? SquareCheck : Square;
                      return (
                        <Pressable
                          key={f.farmer_id}
                          onPress={() => toggleFarmer(f.farmer_id)}
                          className="mb-1 flex-row items-center gap-2 py-1"
                        >
                          <FarmerIcon size={18} color={selected ? '#1A4D3E' : '#757575'} />
                          <Text className="text-sm text-[#333333]">{f.name}</Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </>
            ) : null}

            {formError ? (
              <Text className="mb-2 text-sm text-[#D32F2F]">{formError}</Text>
            ) : null}
    </KeyboardBottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  createWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 160,
    height: 48,
    marginRight: 8,
    backgroundColor: '#1A4D3E',
    borderRadius: 8,
  },
  createWrapDisabled: {
    opacity: 0.65,
  },
  createHit: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' as const },
    }),
  },
  createHitPressed: {
    opacity: 0.9,
  },
  createText: {
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 16,
  },
  cancelWrap: {
    height: 48,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  cancelHit: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { cursor: 'pointer' as const },
    }),
  },
  cancelHitPressed: {
    backgroundColor: '#F5F5F5',
  },
  cancelText: {
    fontWeight: '600',
    color: '#333333',
    fontSize: 16,
  },
});
