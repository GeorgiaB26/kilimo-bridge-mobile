import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, Modal, TextInput, Pressable, ScrollView, Alert, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { submitFarmerTaskCompletion } from '../../api/client';
import { extractApiError } from '../../utils/feedback';

export interface FarmerTaskSubmitTarget {
  id: string;
  name: string;
  payment_value_kes?: number;
}

interface Props {
  task: FarmerTaskSubmitTarget | null;
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function FarmerTaskSubmitModal({ task, visible, onClose, onSubmitted }: Props) {
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);

  const reset = () => {
    setNotes('');
    setPhotoUri(null);
    setPhotoBase64(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    if (!task) return;
    setPicking(true);
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera or gallery access to upload a photo.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
            base64: true,
          });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoBase64(result.assets[0].base64 ?? null);
      }
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (!task) return;
    setSubmitting(true);
    try {
      const photo_url = photoBase64
        ? `data:image/jpeg;base64,${photoBase64}`
        : photoUri ?? undefined;
      await submitFarmerTaskCompletion(task.id, {
        notes: notes.trim() || undefined,
        photo_url,
      });
      reset();
      onSubmitted();
      Alert.alert(
        'Submitted for approval',
        'Your task completion was sent to your manager. You will receive an SMS when it is approved.'
      );
    } catch (err: unknown) {
      Alert.alert('Error', extractApiError(err, 'Could not submit task'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <ScrollView style={styles.card} contentContainerStyle={styles.content}>
          <Pressable onPress={close} style={styles.closeRow}>
            <Text style={styles.close}>✕ Close</Text>
          </Pressable>
          {task ? (
            <>
              <Text style={styles.title}>Mark complete</Text>
              <Text style={styles.taskName}>{task.name}</Text>
              {task.payment_value_kes != null ? (
                <Text style={styles.pay}>Payment: KES {task.payment_value_kes.toLocaleString()}</Text>
              ) : null}

              <Text style={styles.label}>Photo evidence</Text>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={40} color={COLORS.muted} />
                  <Text style={styles.photoHint}>Add a photo of your completed work</Text>
                </View>
              )}
              <View style={styles.photoBtns}>
                <Button mode="outlined" onPress={() => pickImage(true)} loading={picking} style={styles.photoBtn}>
                  {Platform.OS === 'web' ? 'Upload photo' : 'Camera'}
                </Button>
                {Platform.OS !== 'web' ? (
                  <Button mode="outlined" onPress={() => pickImage(false)} loading={picking} style={styles.photoBtn}>
                    Gallery
                  </Button>
                ) : null}
              </View>

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.input}
                multiline
                numberOfLines={4}
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe what you completed..."
              />

              <Button
                mode="contained"
                onPress={submit}
                loading={submitting}
                buttonColor={COLORS.primary}
                style={styles.submitBtn}
              >
                Submit for approval
              </Button>
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { maxHeight: '92%', backgroundColor: COLORS.background, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  content: { padding: 20, paddingBottom: 40 },
  closeRow: { alignSelf: 'flex-end', marginBottom: 4 },
  close: { color: COLORS.muted, fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  taskName: { fontSize: 17, fontWeight: '600', color: COLORS.text, marginTop: 4 },
  pay: { fontSize: 16, fontWeight: '700', color: COLORS.accent, marginTop: 8, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginTop: 12, marginBottom: 6 },
  preview: { width: '100%', height: 200, borderRadius: 12, backgroundColor: COLORS.surface },
  photoPlaceholder: {
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  photoHint: { fontSize: 13, color: COLORS.muted, marginTop: 8 },
  photoBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  photoBtn: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.surface,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitBtn: { marginTop: 20 },
});
