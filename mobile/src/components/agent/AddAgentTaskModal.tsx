import React, { useMemo, useState } from 'react';
import {
  View,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';
import { Square, SquareCheck, X } from 'lucide-react-native';
import { TextInput } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { maskDdMmYyyyInput, parseAgentTaskDueDateInput } from '../../utils/agentTaskDate';
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

export function AddAgentTaskModal({ visible, farmers, loading, onClose, onSubmit }: Props) {
  const agentName = useAuthStore((s) => s.user?.name) ?? 'You';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [assignMode, setAssignMode] = useState<AssignMode>('self');
  const [selectedFarmers, setSelectedFarmers] = useState<string[]>([]);
  const [farmerSearch, setFarmerSearch] = useState('');

  const reset = () => {
    setName('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setAssignMode('self');
    setSelectedFarmers([]);
    setFarmerSearch('');
  };

  const handleClose = () => {
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
    if (!name.trim()) {
      Alert.alert('Task name required', 'Enter a name for this task.');
      return;
    }
    if (!dueDate.trim()) {
      Alert.alert('Due date required', 'Enter a due date as DD/MM/YYYY.');
      return;
    }
    const isoDue = parseAgentTaskDueDateInput(dueDate);
    if (!isoDue) {
      Alert.alert('Invalid date', 'Enter due date as DD/MM/YYYY (e.g. 15/08/2026).');
      return;
    }
    if (assignMode === 'farmers' && selectedFarmers.length === 0) {
      Alert.alert('Select farmers', 'Choose at least one farmer to assign this task to.');
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
    } catch {
      /* parent shows error alert */
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View
        className="flex-1 justify-end bg-black/40"
        style={Platform.OS === 'web' ? { zIndex: 1000 } : undefined}
      >
        <View className="max-h-[90%] rounded-t-2xl bg-white p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#333333]">Create task</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <X size={24} color="#757575" />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text className="mb-1 text-sm font-semibold text-[#333333]">Task name *</Text>
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
            <Text className="mb-1 text-sm font-semibold text-[#333333]">Due date * (DD/MM/YYYY)</Text>
            <TextInput
              value={dueDate}
              onChangeText={(text) => setDueDate(maskDdMmYyyyInput(text))}
              placeholder="15/08/2026"
              keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
              mode="outlined"
              style={{ marginBottom: 4, backgroundColor: '#fff' }}
            />
            <Text className="mb-3 text-xs text-[#757575]">Example: 15/08/2026 for 15 August 2026</Text>
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

            <View className="mt-4 flex-row gap-2">
              <Button
                className="flex-1 h-11 bg-[#1A4D3E]"
                disabled={loading}
                onPress={handleSubmit}
              >
                <Text className="text-white">{loading ? 'Creating…' : 'Create task'}</Text>
              </Button>
              <Button variant="outline" className="h-11" onPress={handleClose} disabled={loading}>
                <Text>Cancel</Text>
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
