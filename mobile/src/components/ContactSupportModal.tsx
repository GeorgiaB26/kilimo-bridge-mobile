import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { KeyboardBottomSheet } from '@/components/ui/KeyboardBottomSheet';
import { createSupportTicket } from '../api/client';
import { uploadSupportPhotoToR2 } from '../services/uploadToR2';
import { extractApiError, showMessage } from '../utils/feedback';

const MAX_PHOTOS = 5;
const MAX_SUBJECT = 200;
const MAX_DESCRIPTION = 4000;

type PendingPhoto = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};

interface ContactSupportModalProps {
  visible: boolean;
  onClose: () => void;
  /** Optional prefill for the subject line. */
  defaultSubject?: string;
  /** Called after a ticket is created successfully (before close toast). */
  onCreated?: (threadId: string) => void;
}

export function ContactSupportModal({
  visible,
  onClose,
  defaultSubject = '',
  onCreated,
}: ContactSupportModalProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSubject(defaultSubject);
    setDescription('');
    setPhotos([]);
    setError('');
    setSubmitting(false);
    setPicking(false);
  }, [visible, defaultSubject]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    if (photos.length >= MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setPicking(true);
    setError('');
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permission needed', 'Please allow camera or gallery access to attach a photo.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
            base64: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
            base64: true,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhotos((prev) => [
        ...prev.slice(0, MAX_PHOTOS - 1),
        {
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add photo');
    } finally {
      setPicking(false);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();
    if (!trimmedSubject) {
      setError('Please enter a subject.');
      return;
    }
    if (!trimmedDescription) {
      setError('Please describe your issue.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const attachmentKeys: string[] = [];
      for (const photo of photos) {
        const uploaded = await uploadSupportPhotoToR2({
          localUri: photo.uri,
          mimeType: photo.mimeType,
          base64: photo.base64,
        });
        attachmentKeys.push(uploaded.objectKey);
      }
      const result = await createSupportTicket({
        subject: trimmedSubject,
        description: trimmedDescription,
        attachmentKeys: attachmentKeys.length ? attachmentKeys : undefined,
      });
      onClose();
      onCreated?.(result.threadId);
      showMessage(
        'Support request sent',
        'Kilimo Bridge Support will reply in your Messages. You can follow the conversation there.'
      );
    } catch (err) {
      setError(extractApiError(err, 'Could not send support request'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardBottomSheet
      visible={visible}
      onRequestClose={handleClose}
      scrollable
      backdropPressDisabled={submitting}
      sheetClassName="max-h-[92%] rounded-t-2xl bg-white px-5 pt-5"
    >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#1A4D3E]">Contact Support</Text>
            <Button variant="ghost" disabled={submitting} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#757575" />
            </Button>
          </View>
          <Text className="mb-4 text-sm text-[#757575]">
            Send a request to Kilimo Bridge Support. Include photos if they help explain the issue.
          </Text>

            <Text className="mb-1 text-sm font-semibold text-[#333333]">Subject</Text>
            <TextInput
              className="mb-3 rounded-xl border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-3 text-[15px] text-[#333333]"
              placeholder="Short summary of the issue"
              placeholderTextColor="#757575"
              maxLength={MAX_SUBJECT}
              value={subject}
              onChangeText={setSubject}
              editable={!submitting}
            />

            <Text className="mb-1 text-sm font-semibold text-[#333333]">Description</Text>
            <TextInput
              className="mb-3 min-h-[120px] rounded-xl border border-[#E0E0E0] bg-[#F9F9F9] px-3 py-3 text-[15px] text-[#333333]"
              placeholder="What happened? What do you need help with?"
              placeholderTextColor="#757575"
              multiline
              maxLength={MAX_DESCRIPTION}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
              editable={!submitting}
            />

            <Text className="mb-2 text-sm font-semibold text-[#333333]">
              Photos (optional, up to {MAX_PHOTOS})
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              <Pressable
                className="h-10 flex-row items-center rounded-lg border border-[#E0E0E0] bg-white px-3"
                disabled={submitting || picking || photos.length >= MAX_PHOTOS}
                onPress={() => pickImage(true)}
                style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined}
              >
                <Ionicons name="camera-outline" size={18} color="#1A4D3E" />
                <Text className="ml-1.5 text-sm font-semibold text-[#1A4D3E]">Camera</Text>
              </Pressable>
              <Pressable
                className="h-10 flex-row items-center rounded-lg border border-[#E0E0E0] bg-white px-3"
                disabled={submitting || picking || photos.length >= MAX_PHOTOS}
                onPress={() => pickImage(false)}
                style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : undefined}
              >
                <Ionicons name="images-outline" size={18} color="#1A4D3E" />
                <Text className="ml-1.5 text-sm font-semibold text-[#1A4D3E]">Gallery</Text>
              </Pressable>
            </View>

            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                <View className="flex-row gap-2">
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={styles.thumbWrap}>
                      <Image source={{ uri: photo.uri }} style={styles.thumb} />
                      <Pressable
                        style={styles.removeThumb}
                        disabled={submitting}
                        onPress={() => removePhoto(index)}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}

            {error ? <Text className="mb-2 text-sm text-[#D32F2F]">{error}</Text> : null}

            <Button
              className="mt-1 h-12 bg-[#1A4D3E]"
              disabled={submitting || picking}
              onPress={handleSubmit}
            >
              {submitting || picking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white">Send to Support</Text>
              )}
            </Button>
    </KeyboardBottomSheet>
  );
}

const styles = StyleSheet.create({
  thumbWrap: { position: 'relative', marginRight: 4 },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removeThumb: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
