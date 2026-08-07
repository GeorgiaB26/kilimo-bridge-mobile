import React, { useState, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ban, Check, X } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ScreenHeader } from '../../components/ScreenHeader';
import { validateCsvImportText } from '../../api/client';
import { downloadImportErrorsCsv, fetchAndDownloadImportErrors, importErrorsToCsv } from '../../utils/downloadImportErrors';
import type { ImportValidationResult } from '../../types';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvValidation'>;

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View className="min-w-[45%] flex-1 items-center rounded-lg bg-[#F9F9F9] p-3">
      <Text className="text-[22px] font-bold text-[#1A4D3E]" style={color ? { color } : undefined}>
        {value.toLocaleString()}
      </Text>
      <Text className="mt-0.5 text-xs text-[#757575]">{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    valid: '#2E7D5E',
    invalid: '#D32F2F',
    duplicate: '#D4AF6A',
  };
  const color = colors[status] ?? '#757575';
  const Icon = status === 'valid' ? Check : status === 'duplicate' ? Ban : X;
  const label = status === 'valid' ? 'Valid' : status === 'duplicate' ? 'Duplicate' : 'Invalid';
  return (
    <View className="flex-1 flex-row items-center gap-1">
      <Icon size={12} color={color} />
      <Text className="text-[11px] font-semibold" style={{ color }}>{label}</Text>
    </View>
  );
}

export function CsvValidationScreen({ navigation, route }: Props) {
  const { fileName, fileContent } = route.params;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ImportValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const errorCount = result?.totalErrors ?? result?.errors.length ?? 0;

  const handleDownloadErrors = async () => {
    if (!result?.sessionId) return;
    setDownloading(true);
    try {
      try {
        await fetchAndDownloadImportErrors(result.sessionId, fileName);
      } catch {
        downloadImportErrorsCsv(result.errors, fileName);
      }
    } catch {
      Alert.alert('Download failed', 'Could not save errors file. Try "Copy errors" or the terminal command below.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyErrors = async () => {
    if (!result?.errors.length) return;
    const csv = importErrorsToCsv(result.errors);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(csv);
      Alert.alert('Copied', `${errorCount} errors copied. Paste into Excel or a text file.`);
      return;
    }
    Alert.alert('Copy', 'Use Download errors CSV on web, or run the terminal export command.');
  };

  useEffect(() => {
    const runValidation = async () => {
      try {
        const data = await validateCsvImportText(fileContent, fileName);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Validation failed');
      } finally {
        setLoading(false);
      }
    };
    runValidation();
  }, [fileName, fileContent]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#1A4D3E" />
        <Text className="mt-4 text-base text-[#757575]">Validating {fileName}...</Text>
      </View>
    );
  }

  if (error || !result) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="mb-4 text-center text-base text-[#D32F2F]">{error ?? 'Validation failed'}</Text>
        <Button variant="outline" onPress={() => navigation.goBack()}>
          <Text>Go Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="p-4 pb-12">
      <ScreenHeader title="Validation Results" subtitle={fileName} />
      {!result.headersMatch && result.columnMapping ? (
        <View className="mb-4 rounded-lg border-l-4 border-[#D4AF6A] bg-[#FFF8E1] p-3">
          <Text className="mb-1 font-semibold text-[#333333]">Column mapping applied</Text>
          <Text className="text-[13px] text-[#757575]">
            Headers did not match exactly. Auto-mapped columns were used.
          </Text>
        </View>
      ) : null}
      <View className="mb-4 flex-row flex-wrap gap-2">
        <StatCard label="Total Rows" value={result.totalRows} />
        <StatCard label="Valid" value={result.validRows} color="#2E7D5E" />
        <StatCard label="Issues" value={result.invalidRows} color="#D32F2F" />
        <StatCard label="Duplicates" value={result.duplicates} color="#D4AF6A" />
      </View>
      <Text className="mb-4 text-center text-base text-[#333333]">
        Will import: <Text className="text-xl font-bold text-[#D4AF6A]">{result.willImport.toLocaleString()}</Text> farmers
      </Text>

      {errorCount > 0 ? (
        <View className="mb-4 rounded-lg border-2 border-[#D4AF6A] bg-[#FFF3E0] p-3.5">
          <Text className="mb-1.5 text-base font-bold text-[#333333]">Fix in Excel — {errorCount} issues</Text>
          <Text className="mb-3 text-[13px] leading-5 text-[#333333]">
            Download or copy the full error list. Use the Row column to find each line in your spreadsheet.
          </Text>
          <Button className="mb-2 h-11 bg-[#1A4D3E]" onPress={handleDownloadErrors} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white">Download all {errorCount} errors (CSV)</Text>
            )}
          </Button>
          <Button variant="outline" className="mb-2 h-11" onPress={handleCopyErrors}>
            <Text>Copy errors to clipboard</Text>
          </Button>
          <Text className={cn('text-[11px] text-[#757575]', Platform.OS === 'web' && 'font-mono')}>
            Terminal: cd backend && npx tsx scripts/export-import-errors.ts
          </Text>
        </View>
      ) : null}

      {result.importHints?.map((hint) => (
        <View key={hint} className="mb-3 rounded-lg border-l-4 border-[#D32F2F] bg-[#FFEBEE] p-3">
          <Text className="text-[13px] leading-5 text-[#333333]">{hint}</Text>
        </View>
      ))}

      {errorCount > 0 ? (
        <>
          <Text className="mb-2 mt-2 text-base font-semibold text-[#1A4D3E]">All errors ({errorCount})</Text>
          {result.errors.map((err, i) => (
            <View key={`${err.row}-${err.field}-${i}`} className="mb-1 rounded bg-[#FFEBEE] p-2">
              <Text className="text-xs text-[#D32F2F]">
                Row {err.row}: {err.field} — {err.error}
                {err.value ? ` [${err.value}]` : ''}
                {err.suggestion ? ` (${err.suggestion})` : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {result.willImport > 0 ? (
        <View className="mb-4 rounded-lg border-l-4 border-[#2E7D5E] bg-[#E8F5E9] p-3">
          <Text className="mb-1.5 font-semibold text-[#333333]">On import, each valid row creates:</Text>
          <Text className="text-[13px] leading-5 text-[#333333]">• Farmer profile</Text>
          <Text className="text-[13px] leading-5 text-[#333333]">• Login account (OTP sign-in)</Text>
          <Text className="text-[13px] leading-5 text-[#333333]">• Project enrollments (if Project 1/2/3 filled)</Text>
        </View>
      ) : null}

      <Text className="mb-2 mt-2 text-base font-semibold text-[#1A4D3E]">Preview (first 10 rows)</Text>
      <View className="mb-4 overflow-hidden rounded-lg border border-[#E0E0E0]">
        <View className="flex-row bg-[#1A4D3E] p-2">
          <Text className="flex-[2] text-xs font-semibold text-white">Name</Text>
          <Text className="flex-[2] text-xs font-semibold text-white">Phone</Text>
          <Text className="flex-1 text-xs font-semibold text-white">District</Text>
          <Text className="flex-1 text-xs font-semibold text-white">Status</Text>
        </View>
        {result.preview.map((row, i) => (
          <View key={i} className="flex-row border-b border-[#E0E0E0] p-2">
            <Text className="flex-[2] text-xs text-[#333333]" numberOfLines={1}>{row.name}</Text>
            <Text className="flex-[2] text-xs text-[#333333]" numberOfLines={1}>{row.phone}</Text>
            <Text className="flex-1 text-xs text-[#333333]" numberOfLines={1}>{row.district}</Text>
            <StatusBadge status={row.status} />
          </View>
        ))}
      </View>

      <View className="my-6 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button
          className="h-12 flex-1 bg-[#1A4D3E]"
          onPress={() => navigation.navigate('CsvImport', { sessionId: result.sessionId, willImport: result.willImport })}
          disabled={result.willImport === 0}
        >
          <Text className="text-white">Import {result.willImport} Farmers</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
