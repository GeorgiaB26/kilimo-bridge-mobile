import React, { useState } from 'react';
import { View, Image, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRegistrationStore } from '../../store/registrationStore';
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
        Alert.alert('Permission needed', 'Please allow camera/gallery access to upload a photo.');
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
        updateForm({
          pictureUri: asset.uri,
          pictureBase64: asset.base64 ?? undefined,
        });
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

  const handleNext = () => {
    if (!formData.pictureUri || !formData.pictureBase64) {
      setError('A verification photo is required');
      return;
    }
    setError('');
    navigation.navigate('Confirm');
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Photo" subtitle="Add a verification photo (required)" />
      <View className="my-6 items-center">
        {formData.pictureUri ? (
          <Image source={{ uri: formData.pictureUri }} className="h-40 w-40 rounded-full" />
        ) : (
          <View className="h-40 w-40 items-center justify-center rounded-full bg-[#1A4D3E]">
            <Text className="text-5xl font-bold text-[#D4AF6A]">{initials || '?'}</Text>
          </View>
        )}
      </View>
      <Button
        className="mb-2 h-12 bg-[#1A4D3E]"
        onPress={() => pickImage(true)}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Take Photo</Text>}
      </Button>
      <Button
        variant="outline"
        className="mb-2 h-12"
        onPress={() => pickImage(false)}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#1A4D3E" /> : <Text>Choose from Gallery</Text>}
      </Button>
      {formData.pictureUri ? (
        <Button
          variant="outline"
          className="mb-2 h-12"
          onPress={() => updateForm({ pictureUri: undefined, pictureBase64: undefined })}
        >
          <Text>Retake</Text>
        </Button>
      ) : null}
      {error ? <Text className="mb-2 text-sm text-[#D32F2F]">{error}</Text> : null}
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button className="h-12 flex-1 bg-[#1A4D3E]" onPress={handleNext}>
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
