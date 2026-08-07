import React, { useState } from 'react';
import {
  View, Text, Image, StyleSheet, Modal, TextInput, Pressable, ScrollView, Platform,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { extractApiError, showMessage } from '../../utils/feedback';
import { submitFarmerTaskWithOutbox } from '../../services/submitFarmerTaskOutbox';

/** Client-only quality check — backend does not enforce a notes minimum. */
const MIN_NOTES_LENGTH = 50;

export interface FarmerTaskSubmitTarget {
  id: string;
  name: string;
  description?: string;
  payment_value_kes?: number;
}

interface Props {
  task: FarmerTaskSubmitTarget | null;
  visible: boolean;
  onClose: () => void;
  onSubmitted: (result: { offline: boolean }) => void;
}

export function FarmerTaskSubmitModal({ task, visible, onClose, onSubmitted }: Props) {
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [notesError, setNotesError] = useState('');

  const reset = () => {
    setNotes('');
    setPhotoUri(null);
    setPhotoBase64(null);
    setPhotoError('');
    setNotesError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickImage = async (useCamera: boolean) => {
    if (!task) return;
    setPicking(true);
    setPhotoError('');
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showMessage('Permission needed', 'Please allow camera or gallery access to upload a photo.');
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
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    let valid = true;
    if (!photoUri) {
      setPhotoError('Please upload a photo (JPEG or PNG) of your completed work.');
      valid = false;
    } else {
      setPhotoError('');
    }
    const noteLen = notes.trim().length;
    if (noteLen < MIN_NOTES_LENGTH) {
      setNotesError(
        `Notes must be at least ${MIN_NOTES_LENGTH} characters (currently ${noteLen}).`
      );
      valid = false;
    } else {
      setNotesError('');
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      const result = await submitFarmerTaskWithOutbox({
        farmerTaskId: task.id,
        taskName: task.name,
        notes: notes.trim(),
        photoLocalUri: photoUri!,
        photoBase64,
      });
      reset();
      onSubmitted({ offline: result.mode === 'offline' });
      if (result.mode === 'offline') {
        showMessage(
          'Saved offline',
          'Your evidence is saved on this device. Open Your Tasks when back online to push it, or wait for automatic sync on this screen.'
        );
      } else {
        showMessage('Task submitted!', 'Awaiting review. We will check status every 30 seconds.');
      }
    } catch (err: unknown) {
      showMessage('Error', extractApiError(err, 'Could not submit task'));
    } finally {
      setSubmitting(false);
    }
  };

  const noteLen = notes.trim().length;
  const notesTooShort = noteLen < MIN_NOTES_LENGTH;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <ScrollView style={styles.card} contentContainerStyle={styles.content}>
          <Pressable onPress={close} style={styles.closeRow}>
            <View style={styles.closeContent}>
              <X size={16} color={COLORS.muted} />
              <Text style={styles.close}>Close</Text>
            </View>
          </Pressable>
          {task ? (
            <>
              <Text style={styles.title}>Submit Task: {task.name}</Text>
              {task.description ? (
                <Text style={styles.description}>{task.description}</Text>
              ) : null}
              {task.payment_value_kes != null ? (
                <Text style={styles.pay}>Payment: KES {task.payment_value_kes.toLocaleString()}</Text>
              ) : null}

              <Text style={styles.label}>Photo evidence *</Text>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={40} color={COLORS.muted} />
                  <Text style={styles.photoHint}>JPEG or PNG required</Text>
                </View>
              )}
              <View style={styles.photoBtns}>
                <Button mode="outlined" onPress={() => pickImage(true)} loading={picking} style={styles.photoBtn} icon="camera">
                  {Platform.OS === 'web' ? 'Upload photo' : 'Camera'}
                </Button>
                {Platform.OS !== 'web' ? (
                  <Button mode="outlined" onPress={() => pickImage(false)} loading={picking} style={styles.photoBtn} icon="image">
                    Gallery
                  </Button>
                ) : null}
              </View>
              {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

              <Text style={styles.label}>Notes * (min {MIN_NOTES_LENGTH} characters)</Text>
              <TextInput
                style={[styles.input, notesError ? styles.inputError : null]}
                multiline
                numberOfLines={4}
                value={notes}
                onChangeText={(text) => {
                  setNotes(text);
                  if (notesError && text.trim().length >= MIN_NOTES_LENGTH) {
                    setNotesError('');
                  }
                }}
                placeholder="Add any notes about your work..."
              />
              <View style={styles.charCountRow}>
                <Text style={[styles.charCount, notesTooShort ? styles.charCountWarn : styles.charCountOk]}>
                  {noteLen}/{MIN_NOTES_LENGTH} characters
                  {notesTooShort ? ` — ${MIN_NOTES_LENGTH - noteLen} more needed` : ''}
                </Text>
                {!notesTooShort ? <Check size={14} color={COLORS.success} /> : null}
              </View>
              {notesError ? <Text style={styles.errorText}>{notesError}</Text> : null}

              <Button
                mode="contained"
                onPress={submit}
                loading={submitting}
                buttonColor={COLORS.primary}
                style={styles.submitBtn}
              >
                Submit
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
  closeContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  close: { color: COLORS.muted, fontSize: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  description: { fontSize: 14, color: COLORS.text, marginTop: 8, lineHeight: 20 },
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
  charCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  charCount: { fontSize: 12, color: COLORS.muted },
  charCountWarn: { color: COLORS.alert, fontWeight: '600' },
  charCountOk: { color: COLORS.success },
  errorText: { fontSize: 13, color: COLORS.alert, marginTop: 6, lineHeight: 18 },
  inputError: { borderColor: COLORS.alert },
  submitBtn: { marginTop: 20 },
});
