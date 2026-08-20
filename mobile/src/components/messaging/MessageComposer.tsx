import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Image,
  Alert,
  Platform,
  StyleSheet,
  Text as RNText,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../constants';
import { showMessage } from '../../utils/feedback';

export type PendingComposerPhoto = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
};

async function pickComposerPhoto(useCamera: boolean): Promise<PendingComposerPhoto | null> {
  const permission = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showMessage(
      'Permission needed',
      useCamera
        ? 'Allow camera access so you can attach a photo.'
        : 'Allow gallery access so you can attach a photo.'
    );
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = {
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.7,
    base64: true,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  };
  const result = useCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType };
}

type Props = {
  placeholder: string;
  maxLength: number;
  sending: boolean;
  disabled: boolean;
  sendColor?: string;
  bottomInset: number;
  value: string;
  onChangeText: (text: string) => void;
  pendingPhoto: PendingComposerPhoto | null;
  onPendingPhotoChange: (photo: PendingComposerPhoto | null) => void;
  onSend: () => void;
};

export function MessageComposer({
  placeholder,
  maxLength,
  sending,
  disabled,
  sendColor = COLORS.primary,
  bottomInset,
  value,
  onChangeText,
  pendingPhoto,
  onPendingPhotoChange,
  onSend,
}: Props) {
  const [picking, setPicking] = useState(false);
  const canCompose = !disabled && !sending && !picking;
  const canSend = canCompose && (!!value.trim() || !!pendingPhoto);

  const attachPhoto = async (useCamera: boolean) => {
    if (!canCompose) return;
    setPicking(true);
    try {
      const photo = await pickComposerPhoto(useCamera);
      if (photo) onPendingPhotoChange(photo);
    } catch (err) {
      showMessage('Could not attach photo', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPicking(false);
    }
  };

  const openAttachOptions = () => {
    if (!canCompose) return;
    if (Platform.OS === 'web') {
      void attachPhoto(false);
      return;
    }
    Alert.alert('Attach photo', 'Add a photo to this message', [
      { text: 'Take photo', onPress: () => void attachPhoto(true) },
      { text: 'Choose from gallery', onPress: () => void attachPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.footer, { paddingBottom: 10 + Math.max(bottomInset, 0) }]}>
      {pendingPhoto ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: pendingPhoto.uri }} style={styles.preview} />
          <Pressable
            style={styles.removePreview}
            onPress={() => onPendingPhotoChange(null)}
            disabled={!canCompose}
            accessibilityLabel="Remove attached photo"
          >
            <Ionicons name="close" size={14} color="#fff" />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <Pressable
          style={[styles.attachBtn, !canCompose && styles.disabled]}
          onPress={openAttachOptions}
          disabled={!canCompose}
          accessibilityLabel="Attach photo"
        >
          <Ionicons name="attach-outline" size={24} color={canCompose ? sendColor : COLORS.muted} />
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={maxLength}
          editable={canCompose}
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: sendColor }, !canSend && styles.disabled]}
          onPress={onSend}
          disabled={!canSend}
        >
          <RNText style={styles.sendText}>{sending ? '…' : 'Send'}</RNText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  previewRow: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: 40,
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  removePreview: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  sendBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
