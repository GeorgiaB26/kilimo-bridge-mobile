import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Photo'>;

export function PhotoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    setLoading(true);
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera/gallery access to upload a photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });

      if (!result.canceled && result.assets[0]) {
        updateForm({ pictureUri: result.assets[0].uri });
      }
    } finally {
      setLoading(false);
    }
  };

  const initials = formData.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Photo" subtitle="Add a verification photo (optional)" />
      <View style={styles.preview}>
        {formData.pictureUri ? (
          <Image source={{ uri: formData.pictureUri }} style={styles.image} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials || '?'}</Text>
          </View>
        )}
      </View>
      <Button title="Take Photo" onPress={() => pickImage(true)} loading={loading} style={styles.btn} />
      <Button title="Choose from Gallery" onPress={() => pickImage(false)} variant="outline" loading={loading} style={styles.btn} />
      {formData.pictureUri ? (
        <Button title="Retake" onPress={() => updateForm({ pictureUri: undefined })} variant="outline" style={styles.btn} />
      ) : null}
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={() => navigation.navigate('Confirm')} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  preview: { alignItems: 'center', marginVertical: 24 },
  image: { width: 160, height: 160, borderRadius: 80 },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 48, color: COLORS.accent, fontWeight: '700' },
  btn: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
