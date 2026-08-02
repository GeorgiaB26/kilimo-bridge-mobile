import React, { useState } from 'react';
import { View, Modal, ScrollView, Pressable } from 'react-native';
import { TextInput } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

interface FarmerOption {
  farmer_id: string;
  name: string;
}

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedFarmers, setSelectedFarmers] = useState<string[]>([]);

  const reset = () => {
    setName('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setSelectedFarmers([]);
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

  const handleSubmit = async () => {
    if (!name.trim() || !dueDate.trim()) return;
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      due_date: dueDate.trim(),
      priority,
      assigned_farmers: selectedFarmers.length ? selectedFarmers : undefined,
    });
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] rounded-t-2xl bg-white p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#333333]">Add task to your profile</Text>
            <Pressable onPress={handleClose}>
              <Text className="text-2xl text-[#757575]">×</Text>
            </Pressable>
          </View>
          <ScrollView>
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
            <Text className="mb-1 text-sm font-semibold text-[#333333]">Due date * (YYYY-MM-DD)</Text>
            <TextInput
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-08-15"
              mode="outlined"
              style={{ marginBottom: 12, backgroundColor: '#fff' }}
            />
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
            {farmers.length > 0 ? (
              <>
                <Text className="mb-2 text-sm font-semibold text-[#333333]">
                  Assign to farmers (optional)
                </Text>
                {farmers.slice(0, 20).map((f) => (
                  <Pressable
                    key={f.farmer_id}
                    onPress={() => toggleFarmer(f.farmer_id)}
                    className="mb-1 flex-row items-center gap-2 py-1"
                  >
                    <Text>{selectedFarmers.includes(f.farmer_id) ? '☑' : '☐'}</Text>
                    <Text className="text-sm text-[#333333]">{f.name}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <View className="mt-4 flex-row gap-2">
              <Button
                className="flex-1 h-11 bg-[#1A4D3E]"
                disabled={loading || !name.trim() || !dueDate.trim()}
                onPress={handleSubmit}
              >
                <Text className="text-white">Create task</Text>
              </Button>
              <Button variant="outline" className="h-11" onPress={handleClose}>
                <Text>Cancel</Text>
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
