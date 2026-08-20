import React, { useState } from 'react';
import { View, Image, ActivityIndicator, Pressable, Platform, StyleSheet, ScrollView } from 'react-native';
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
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Verification photo"
          subtitle="Required — take a clear photo of the member's face"
        />
        <Text style={styles.hint}>
          This must be a real photo from your camera or gallery. Letter avatars are not accepted.
        </Text>
        <View style={styles.previewWrap}>
          {hasPhoto && formData.pictureUri ? (
            <Image source={{ uri: formData.pictureUri }} style={styles.preview} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="camera-outline" size={48} color="#D4AF6A" />
              <Text style={styles.placeholderLabel}>Photo required</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => pickImage(true)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? 'Retake photo' : 'Take photo'}
          style={({ pressed }) => [styles.primaryBtn, loading && styles.btnDisabled, pressed && styles.btnPressed]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{hasPhoto ? 'Retake photo' : 'Take photo'}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => pickImage(false)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
          style={({ pressed }) => [
            styles.outlineBtn,
            styles.btnSpaced,
            loading && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#1A4D3E" />
          ) : (
            <Text style={styles.outlineBtnText}>Choose from gallery</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.navBtn, styles.outlineBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.outlineBtnText}>Back</Text>
        </Pressable>
        <Pressable
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel="Next"
          style={({ pressed }) => [styles.navBtn, styles.primaryBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.primaryBtnText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  hint: {
    marginBottom: 16,
    fontSize: 14,
    color: '#757575',
  },
  previewWrap: {
    marginVertical: 16,
    alignItems: 'center',
  },
  preview: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#E8E8E8',
  },
  placeholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D4AF6A',
    backgroundColor: '#1A4D3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLabel: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#D4AF6A',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  navBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  btnSpaced: {
    marginTop: 8,
  },
  primaryBtnText: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 16,
  },
  outlineBtnText: {
    width: '100%',
    textAlign: 'center',
    fontWeight: '600',
    color: '#333333',
    fontSize: 16,
  },
  error: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 14,
    color: '#D32F2F',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnPressed: {
    opacity: 0.9,
  },
});
