import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const MAX_BYTES = 50 * 1024 * 1024;

/** MIME types and extensions macOS/Safari/Chrome use for CSV exports */
const CSV_PICKER_TYPES = [
  '.csv',
  '.txt',
  'text/csv',
  'text/plain',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'public.comma-separated-values-text',
];

export interface PickedCsvFile {
  name: string;
  content: string;
}

function pickCsvOnWeb(): Promise<PickedCsvFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // Broad accept so Mac Finder does not grey out CSV files tagged as text/plain
    input.accept = '.csv,.txt,text/csv,text/plain,text/comma-separated-values,application/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        resolve(null);
        return;
      }
      try {
        const content = await file.text();
        resolve({ name: file.name, content });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export async function pickCsvFile(): Promise<PickedCsvFile | null> {
  if (Platform.OS === 'web') {
    return pickCsvOnWeb();
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: CSV_PICKER_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const response = await fetch(asset.uri);
  const content = await response.text();
  return { name: asset.name, content };
}
