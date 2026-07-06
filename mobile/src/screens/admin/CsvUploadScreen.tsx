import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS, CSV_COLUMNS } from '../../constants';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'CsvUpload'>;

export function CsvUploadScreen({ navigation }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.size && asset.size > 50 * 1024 * 1024) {
          Alert.alert('File too large', 'CSV file must be under 50MB.');
          return;
        }
        setFileName(asset.name);
        const response = await fetch(asset.uri);
        const content = await response.text();
        setFileContent(content);
      }
    } catch {
      Alert.alert('Error', 'Failed to read CSV file.');
    }
  };

  const handleValidate = () => {
    if (!fileContent || !fileName) {
      Alert.alert('No file', 'Please select a CSV file first.');
      return;
    }
    navigation.navigate('CsvValidation', { fileName, fileContent });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Import Farmers"
        subtitle="Upload a CSV file to bulk-import farmers"
      />
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Expected CSV columns:</Text>
        <Text style={styles.columns}>{CSV_COLUMNS.join(' | ')}</Text>
      </View>
      <View style={styles.uploadArea}>
        {fileName ? (
          <>
            <Text style={styles.fileIcon}>📄</Text>
            <Text style={styles.fileName}>{fileName}</Text>
            <Text style={styles.fileHint}>Ready to validate</Text>
          </>
        ) : (
          <>
            <Text style={styles.fileIcon}>📁</Text>
            <Text style={styles.uploadText}>Select a CSV file</Text>
            <Text style={styles.uploadHint}>Max size: 50MB</Text>
          </>
        )}
      </View>
      <Button title={fileName ? 'Change File' : 'Choose CSV File'} onPress={pickFile} variant="outline" />
      <Button
        title="Validate & Preview"
        onPress={handleValidate}
        disabled={!fileContent}
        loading={loading}
        style={styles.validateBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  infoCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', color: COLORS.primary, marginBottom: 6 },
  columns: { fontSize: 11, color: COLORS.muted, lineHeight: 18 },
  uploadArea: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 20,
  },
  fileIcon: { fontSize: 40, marginBottom: 8 },
  fileName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  fileHint: { fontSize: 13, color: COLORS.success, marginTop: 4 },
  uploadText: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  uploadHint: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  validateBtn: { marginTop: 12 },
});
