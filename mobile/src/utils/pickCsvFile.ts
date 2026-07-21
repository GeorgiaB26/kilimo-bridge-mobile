import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const MAX_BYTES = 50 * 1024 * 1024;
export const BINARY_IMPORT_PREFIX = '__KB_XLSX_BASE64__:';

/** MIME types and extensions macOS/Safari/Chrome use for CSV and Excel exports */
const SPREADSHEET_PICKER_TYPES = [
  '.csv',
  '.txt',
  '.xlsx',
  '.xls',
  'text/csv',
  'text/plain',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'public.comma-separated-values-text',
];

export interface PickedCsvFile {
  name: string;
  content: string;
  isExcel?: boolean;
}

function isExcelBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function readPickedFile(file: File): Promise<PickedCsvFile> {
  if (file.size > MAX_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (isExcelBytes(bytes)) {
    return {
      name: file.name,
      content: `${BINARY_IMPORT_PREFIX}${arrayBufferToBase64(buffer)}`,
      isExcel: true,
    };
  }

  return {
    name: file.name,
    content: new TextDecoder('utf-8').decode(buffer),
    isExcel: false,
  };
}

function pickCsvOnWeb(): Promise<PickedCsvFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.xlsx,.xls,text/csv,text/plain,text/comma-separated-values,application/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(await readPickedFile(file));
      } catch (err) {
        reject(err);
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
    type: SPREADSHEET_PICKER_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const response = await fetch(asset.uri);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (isExcelBytes(bytes)) {
    const base64 = arrayBufferToBase64(buffer);
    return {
      name: asset.name,
      content: `${BINARY_IMPORT_PREFIX}${base64}`,
      isExcel: true,
    };
  }

  return {
    name: asset.name,
    content: new TextDecoder('utf-8').decode(buffer),
    isExcel: false,
  };
}
