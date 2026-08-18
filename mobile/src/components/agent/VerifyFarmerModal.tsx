import React, { useState } from 'react';
import { View, Pressable, TextInput, Alert } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KeyboardBottomSheet } from '@/components/ui/KeyboardBottomSheet';

interface Props {
  visible: boolean;
  farmerName: string;
  farmerPhone: string;
  locationLabel: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (verificationStatus: 'verified' | 'rejected', notes?: string) => void;
}

export function VerifyFarmerModal({
  visible,
  farmerName,
  farmerPhone,
  locationLabel,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [verifiedInPerson, setVerifiedInPerson] = useState<'yes' | 'no' | null>(null);
  const [notes, setNotes] = useState('');

  const reset = () => {
    setVerifiedInPerson(null);
    setNotes('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!verifiedInPerson) {
      Alert.alert('Required', 'Select Yes or No for in-person verification.');
      return;
    }
    onSubmit(verifiedInPerson === 'yes' ? 'verified' : 'rejected', notes.trim() || undefined);
    reset();
  };

  return (
    <KeyboardBottomSheet
      visible={visible}
      onRequestClose={handleClose}
      backdropPressDisabled={loading}
      sheetClassName="rounded-t-2xl bg-white p-5"
    >
      <Text className="mb-1 text-xl font-bold text-[#1A4D3E]">Verify Farmer</Text>
      <Text className="mb-1 text-base font-semibold text-[#333333]">{farmerName}</Text>
      <Text className="text-sm text-[#757575]">{farmerPhone}</Text>
      <Text className="mb-4 text-sm text-[#757575]">{locationLabel}</Text>

      <Text className="mb-2 text-sm font-semibold text-[#333333]">Verified in person? *</Text>
      <View className="mb-4 flex-row gap-3">
        <Pressable
          className={`flex-1 rounded-lg border p-3 ${verifiedInPerson === 'yes' ? 'border-[#1A4D3E] bg-[#E8F5F0]' : 'border-[#E0E0E0]'}`}
          onPress={() => setVerifiedInPerson('yes')}
        >
          <Text className="text-center font-semibold text-[#333333]">Yes</Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-lg border p-3 ${verifiedInPerson === 'no' ? 'border-[#D32F2F] bg-[#FFEBEE]' : 'border-[#E0E0E0]'}`}
          onPress={() => setVerifiedInPerson('no')}
        >
          <Text className="text-center font-semibold text-[#333333]">No</Text>
        </Pressable>
      </View>

      <Text className="mb-2 text-sm font-semibold text-[#333333]">Verification notes (optional)</Text>
      <TextInput
        className="mb-4 min-h-[80px] rounded-lg border border-[#E0E0E0] bg-[#F5F5F5] p-3 text-[15px]"
        placeholder="e.g. ID checked, photo match"
        value={notes}
        onChangeText={setNotes}
        multiline
        textAlignVertical="top"
      />

      <Button className="mb-2 h-12 bg-[#1A4D3E]" disabled={loading} onPress={handleSubmit}>
        <Text className="text-white">{loading ? 'Submitting…' : 'Submit verification'}</Text>
      </Button>
      <Button variant="ghost" className="h-11" onPress={handleClose}>
        <Text>Cancel</Text>
      </Button>
    </KeyboardBottomSheet>
  );
}
