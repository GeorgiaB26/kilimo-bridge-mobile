import React, { useState } from 'react';
import { Modal, View, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

interface FarmerHelpModalProps {
  visible: boolean;
  agentName?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
}

export function FarmerHelpModal({
  visible,
  agentName,
  loading = false,
  onClose,
  onSubmit,
}: FarmerHelpModalProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleClose = () => {
    setMessage('');
    setError('');
    onClose();
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Please write a short message.');
      return;
    }
    setError('');
    try {
      await onSubmit(trimmed);
      setMessage('');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send message');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-end bg-black/40"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="rounded-t-2xl bg-white px-5 pb-8 pt-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#1A4D3E]">Get in touch with your field agent</Text>
            <Button variant="ghost" onPress={handleClose}>
              <Ionicons name="close" size={24} color="#757575" />
            </Button>
          </View>
          <Text className="mb-3 text-sm text-[#757575]">
            {agentName
              ? `Your message will be sent to ${agentName}. They will contact you as soon as possible.`
              : 'Your message will be sent to your assigned field agent.'}
          </Text>
          <TextInput
            className="mb-2 min-h-[120px] rounded-xl border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-3 text-[15px] text-[#333333]"
            placeholder="Write your message here…"
            placeholderTextColor="#757575"
            multiline
            maxLength={500}
            value={message}
            onChangeText={setMessage}
            textAlignVertical="top"
          />
          {error ? <Text className="mb-2 text-sm text-[#D32F2F]">{error}</Text> : null}
          <Button className="h-12 bg-[#1A4D3E]" disabled={loading} onPress={handleSend}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Send message</Text>}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
