import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '../../components/ScreenHeader';
import { APP_BUILD } from '../../constants/build';
import { confirmCsvImport, getImportProgress, getImportComplete } from '../../api/client';
import { showMessage } from '../../utils/feedback';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvImport'>;
type ImportPhase = 'starting' | 'running' | 'complete' | 'failed';

export function CsvImportScreen({ navigation, route }: Props) {
  const { sessionId, willImport } = route.params;
  const initialTarget = Number(willImport) || 0;

  const [importId, setImportId] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState(initialTarget);
  const [phase, setPhase] = useState<ImportPhase>('starting');
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertedRef = useRef(false);
  const completingRef = useRef(false);

  const isComplete = phase === 'complete';

  useEffect(() => {
    if (!isComplete || alertedRef.current) return;
    alertedRef.current = true;
    showMessage(
      'Import successful!',
      `${imported.toLocaleString()} farmers have been imported and can now log in with their phone numbers.`
    );
  }, [isComplete, imported]);

  useEffect(() => {
    const startImport = async () => {
      try {
        const result = await confirmCsvImport(sessionId, true);
        const total = Number(result.totalToImport) || initialTarget;
        setImportId(result.importId);
        setImportTarget(total);
        setPhase('running');
      } catch {
        setPhase('failed');
      }
    };
    startImport();
  }, [sessionId, initialTarget]);

  useEffect(() => {
    if (!importId || phase !== 'running') return;

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const finishImport = (count: number, duplicates = 0) => {
      if (completingRef.current) return;
      completingRef.current = true;
      stopPolling();
      setImported(count);
      setProgress(100);
      setDuplicatesSkipped(duplicates);
      setPhase('complete');
    };

    const poll = async () => {
      try {
        const prog = await getImportProgress(sessionId, importId);
        setProgress(prog.percentComplete);
        setImported(prog.importedCount);

        const doneByProgress =
          prog.status === 'complete' ||
          (importTarget > 0 && prog.importedCount >= importTarget) ||
          prog.percentComplete >= 100;

        if (!doneByProgress) return;

        const complete = await getImportComplete(sessionId);
        if (complete) {
          finishImport(complete.importedCount, complete.duplicatesSkipped ?? 0);
          return;
        }

        if (prog.status === 'complete' || prog.importedCount >= importTarget) {
          finishImport(Math.max(prog.importedCount, importTarget));
        }
      } catch {
        // keep polling until backend marks session complete
      }
    };

    intervalRef.current = setInterval(poll, 500);
    poll();
    return () => stopPolling();
  }, [importId, sessionId, importTarget, phase]);

  const remaining = Math.max(0, importTarget - imported);

  return (
    <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
      {isComplete ? (
        <>
          <ScreenHeader title="Import Complete" subtitle="Farmers have been imported" />
          <View className="my-4 items-center rounded-xl border-2 border-[#2E7D5E] bg-[#E8F5E9] p-8">
            <Text className="text-[56px] text-[#2E7D5E]">✓</Text>
            <Text className="mt-2 text-2xl font-bold text-[#1A4D3E]">Import successful!</Text>
            <Text className="mt-3 text-xl font-semibold text-[#D4AF6A]">{imported.toLocaleString()} farmers imported</Text>
            {duplicatesSkipped > 0 ? (
              <Text className="mt-2 text-sm text-[#757575]">{duplicatesSkipped} duplicates were skipped</Text>
            ) : null}
          </View>
          <Button className="h-12 bg-[#1A4D3E]" onPress={() => navigation.popToTop()}>
            <Text className="text-white">Done — back to Import</Text>
          </Button>
        </>
      ) : (
        <>
          <ScreenHeader
            title={phase === 'failed' ? 'Import failed' : 'Importing...'}
            subtitle={
              phase === 'failed'
                ? 'Could not start import'
                : `Importing ${importTarget.toLocaleString()} farmers`
            }
          />
          <View className="mt-4 items-center rounded-xl bg-[#F9F9F9] p-6">
            <Text className="text-5xl font-bold text-[#1A4D3E]">{phase === 'failed' ? '!' : `${progress}%`}</Text>
            <View className="my-4 h-3 w-full overflow-hidden rounded-md bg-[#E0E0E0]">
              <View className="h-full rounded-md bg-[#2E7D5E]" style={{ width: `${Math.min(progress, 100)}%` }} />
            </View>
            <Text className="text-sm text-[#333333]">
              {imported.toLocaleString()} imported, {remaining.toLocaleString()} remaining
            </Text>
          </View>
          {phase === 'failed' ? (
            <Button className="mt-4 h-12" variant="outline" onPress={() => navigation.goBack()}>
              <Text>Back</Text>
            </Button>
          ) : null}
        </>
      )}
      <Text className="mt-6 text-center text-[11px] text-[#757575]">Screen build {APP_BUILD}</Text>
    </ScrollView>
  );
}
