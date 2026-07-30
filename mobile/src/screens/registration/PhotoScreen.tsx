import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import { validatePhotoAsset } from '../../utils/photoValidation';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Photo'>;

export function PhotoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [qualityMsg, setQualityMsg] = useState<string | null>(null);

  const pickImage = async (useCamera: boolean) => {
    setLoading(true);
    setQualityMsg(null);
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera/gallery access to upload a photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const check = await validatePhotoAsset(asset);
        if (!check.ok) {
          setQualityMsg(check.error ?? 'Photo quality check failed');
          Alert.alert('Photo quality', check.error ?? 'Please retake the photo.');
          return;
        }
        setQualityMsg(`Quality OK (${check.width}×${check.height})`);
        updateForm({ pictureUri: asset.uri });
      }
    } finally {
      setLoading(false);
    }
  };

  const onNext = () => {
    if (!formData.pictureUri) {
      Alert.alert('Photo required', 'A verification photo is required before activation.');
      return;
    }
    navigation.navigate('Confirm');
  };

  const initials = formData.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Verification photo" subtitle="Required · min 480×480 · max 5 MB" />
      <View style={styles.preview}>
        {formData.pictureUri ? (
          <Image source={{ uri: formData.pictureUri }} style={styles.image} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials || '?'}</Text>
          </View>
        )}
        {qualityMsg ? (
          <View style={styles.qualityRow}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.qualityOk}>{qualityMsg}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>Face clearly visible, good lighting, no blur</Text>
        )}
      </View>
      <Button title="Take Photo" onPress={() => pickImage(true)} loading={loading} style={styles.btn} />
      <Button title="Choose from Gallery" onPress={() => pickImage(false)} variant="outline" loading={loading} style={styles.btn} />
      {formData.pictureUri ? (
        <Button title="Retake" onPress={() => { updateForm({ pictureUri: undefined }); setQualityMsg(null); }} variant="outline" style={styles.btn} />
      ) : null}
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={onNext} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  preview: { alignItems: 'center', marginVertical: 20 },
  image: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: COLORS.accent },
  avatar: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 48, color: COLORS.accent, fontWeight: '700' },
  hint: { fontSize: 13, color: COLORS.muted, marginTop: 12 },
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  qualityOk: { fontSize: 13, color: COLORS.success },
  btn: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
