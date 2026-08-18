import React, { useState } from 'react';
import { View, Image, ActivityIndicator, Pressable, Platform, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
import { showMessage } from '../../utils/feedback';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Photo'>;

export function PhotoScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async (useCamera: boolean) => {
    setLoading(true);
    setError('');
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showMessage('Permission needed', 'Please allow camera/gallery access to upload a photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          showMessage('Photo error', 'Could not read image. Please try again.');
          return;
        }
        updateForm({
          pictureUri: asset.uri,
          pictureBase64: asset.base64,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (!formData.pictureBase64) {
      setError('A real verification photo is required (camera or gallery).');
      return;
    }
    setError('');
    navigation.navigate('Confirm');
  };

  const hasPhoto = !!formData.pictureBase64;

  return (
    <View className="flex-1">
      <ScreenHeader
        title="Verification photo"
        subtitle="Required — take a clear photo of the member's face"
      />
      <Text className="mb-4 text-sm text-[#757575]">
        This must be a real photo from your camera or gallery. Letter avatars are not accepted.
      </Text>
      <View className="my-4 items-center">
        {hasPhoto && formData.pictureUri ? (
          <Image source={{ uri: formData.pictureUri }} className="h-40 w-40 rounded-full" />
        ) : (
          <View className="h-40 w-40 items-center justify-center rounded-full border-2 border-dashed border-[#D4AF6A] bg-[#1A4D3E]">
            <Ionicons name="camera-outline" size={48} color="#D4AF6A" />
            <Text className="mt-2 text-center text-xs font-semibold text-[#D4AF6A]">Photo required</Text>
          </View>
        )}
      </View>
      <Pressable
        onPress={() => pickImage(true)}
        disabled={loading}
        style={({ pressed }) => [styles.primaryBtn, loading && styles.btnDisabled, pressed && styles.btnPressed]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Take photo</Text>}
      </Pressable>
      <Pressable
        onPress={() => pickImage(false)}
        disabled={loading}
        style={({ pressed }) => [styles.outlineBtn, loading && styles.btnDisabled, pressed && styles.btnPressed]}
        className="mt-2"
      >
        {loading ? <ActivityIndicator color="#1A4D3E" /> : <Text className="font-semibold text-[#333333]">Choose from gallery</Text>}
      </Pressable>
      {formData.pictureUri ? (
        <Pressable
          onPress={() => updateForm({ pictureUri: undefined, pictureBase64: undefined })}
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
          className="mt-2"
        >
          <Text className="font-semibold text-[#333333]">Retake</Text>
        </Pressable>
      ) : null}
      {error ? <Text className="mb-2 mt-2 text-sm text-[#D32F2F]">{error}</Text> : null}
      <View className="mt-2 flex-row gap-3">
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.outlineBtn, styles.halfBtn, pressed && styles.btnPressed]}
        >
          <Text className="font-semibold text-[#333333]">Back</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [styles.primaryBtn, styles.halfBtn, pressed && styles.btnPressed]}
        >
          <Text className="font-semibold text-white">Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#1A4D3E',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  outlineBtn: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  halfBtn: {
    flex: 1,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnPressed: {
    opacity: 0.9,
  },
});
