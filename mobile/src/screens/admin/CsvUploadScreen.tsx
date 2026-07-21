import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS, CSV_COLUMNS } from '../../constants';
import { pickCsvFile } from '../../utils/pickCsvFile';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvUpload'>;

export function CsvUploadScreen({ navigation }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickFile = async () => {
    setLoading(true);
    try {
      const picked = await pickCsvFile();
      if (!picked) return;
      setFileName(picked.name);
      setFileContent(picked.content);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'FILE_TOO_LARGE') {
        Alert.alert('File too large', 'CSV file must be under 50MB.');
        return;
      }
      Alert.alert('Error', 'Failed to read CSV file. Try exporting from Excel as CSV (Comma delimited).');
    } finally {
      setLoading(false);
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
        subtitle="Upload a CSV — profiles, login accounts, and projects are created automatically"
      />
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Expected CSV columns:</Text>
        <Text style={styles.columns}>{CSV_COLUMNS.join(' | ')}</Text>
        <Text style={styles.hint}>
          Cooperative files (e.g. GWED-G) with preamble rows, Memebrship Group typo, or S/N columns are supported. Phone is required so each farmer can sign in.
        </Text>
        <Text style={styles.macHint}>
          Mac tip: If files look greyed out, export from Excel using File → Save As → CSV (Comma delimited). .xlsx files cannot be imported directly.
        </Text>
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
            <Text style={styles.uploadHint}>Max size: 50MB · .csv or .txt</Text>
          </>
        )}
      </View>
      <Button
        title={fileName ? 'Change File' : 'Choose CSV File'}
        onPress={pickFile}
        variant="outline"
        loading={loading}
      />
      <Button
        title="Validate & Preview"
        onPress={handleValidate}
        disabled={!fileContent}
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
  hint: { fontSize: 12, color: COLORS.info, marginTop: 10, lineHeight: 18 },
  macHint: { fontSize: 12, color: COLORS.warning, marginTop: 8, lineHeight: 18 },
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
