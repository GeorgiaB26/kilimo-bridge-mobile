import React, { useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { FileText, Folder } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { CSV_COLUMNS } from '../../constants';
import { pickCsvFile } from '../../utils/pickCsvFile';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvUpload'>;

export function CsvUploadScreen({ navigation }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isExcel, setIsExcel] = useState(false);
  const [loading, setLoading] = useState(false);

  const pickFile = async () => {
    setLoading(true);
    try {
      const picked = await pickCsvFile();
      if (!picked) return;
      setFileName(picked.name);
      setFileContent(picked.content);
      setIsExcel(Boolean(picked.isExcel));
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
    <View className="flex-1">
      <ScreenHeader
        title="Import Farmers"
        subtitle="Upload a CSV — profiles, login accounts, and projects are created automatically"
      />
      <View className="mb-5 rounded-lg bg-[#F9F9F9] p-3.5">
        <Text className="mb-1.5 text-[13px] font-semibold text-[#1A4D3E]">Expected CSV columns:</Text>
        <Text className="text-[11px] leading-[18px] text-[#757575]">{CSV_COLUMNS.join(' | ')}</Text>
        <Text className="mt-2.5 text-xs leading-[18px] text-[#1976D2]">
          Cooperative files (e.g. GWED-G) with preamble rows, Memebrship Group typo, or S/N columns are supported. Phone is required so each farmer can sign in.
        </Text>
        <Text className="mt-2 text-xs leading-[18px] text-[#FF9800]">
          Excel (.xlsx) and CSV are supported. On Mac, if CSV files look greyed out, pick them anyway or export from Excel as CSV (Comma delimited).
        </Text>
      </View>
      <View className="mb-5 items-center rounded-xl border-2 border-dashed border-[#E0E0E0] p-8">
        {fileName ? (
          <>
            <FileText size={40} color="#757575" style={{ marginBottom: 8 }} />
            <Text className="text-base font-semibold text-[#333333]">{fileName}</Text>
            <Text className="mt-1 text-[13px] text-[#2E7D5E]">{isExcel ? 'Excel workbook ready to validate' : 'Ready to validate'}</Text>
          </>
        ) : (
          <>
            <Folder size={40} color="#757575" style={{ marginBottom: 8 }} />
            <Text className="text-base font-medium text-[#333333]">Select a CSV file</Text>
            <Text className="mt-1 text-[13px] text-[#757575]">Max size: 50MB · .csv, .txt, or .xlsx</Text>
          </>
        )}
      </View>
      <Button
        variant="outline"
        className="h-12"
        onPress={pickFile}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#1A4D3E" />
        ) : (
          <Text>{fileName ? 'Change File' : 'Choose CSV File'}</Text>
        )}
      </Button>
      <Button
        className="mt-3 h-12 bg-[#1A4D3E]"
        onPress={handleValidate}
        disabled={!fileContent}
      >
        <Text className="text-white">Validate & Preview</Text>
      </Button>
    </View>
  );
}
