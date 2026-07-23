import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { confirmCsvImport, getImportProgress, getImportComplete } from '../../api/client';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvImport'>;

export function CsvImportScreen({ navigation, route }: Props) {
  const { sessionId, willImport } = route.params;
  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [failed, setFailed] = useState(false);
  const [completeData, setCompleteData] = useState<{
    importedCount: number;
    duplicatesSkipped: number;
    errorsCount: number;
    errors: Array<{ row: number; field: string; error: string }>;
  } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  const target = Number(willImport) || 0;
  const isDone = target > 0 && imported >= target;

  useEffect(() => {
    const startImport = async () => {
      try {
        const result = await confirmCsvImport(sessionId, true);
        setImportId(result.importId);
      } catch {
        setFailed(true);
      }
    };
    startImport();
  }, [sessionId]);

  useEffect(() => {
    if (!importId || finishedRef.current) return;

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const markDone = async (count: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopPolling();
      setProgress(100);
      setImported(count);
      setCompleteData((prev) => prev ?? {
        importedCount: count,
        duplicatesSkipped: 0,
        errorsCount: 0,
        errors: [],
      });
      try {
        const complete = await getImportComplete(sessionId);
        if (complete) {
          setCompleteData({
            importedCount: complete.importedCount,
            duplicatesSkipped: complete.duplicatesSkipped,
            errorsCount: complete.errorsCount,
            errors: complete.errors,
          });
        }
      } catch {
        // progress count is enough for success UI
      }
    };

    const poll = async () => {
      try {
        const prog = await getImportProgress(sessionId, importId);
        setProgress(prog.percentComplete);
        setImported(prog.importedCount);
        if (
          prog.status === 'complete' ||
          (target > 0 && prog.importedCount >= target) ||
          prog.percentComplete >= 100
        ) {
          await markDone(prog.importedCount);
        }
      } catch {
        // keep polling
      }
    };

    intervalRef.current = setInterval(poll, 600);
    poll();

    return () => stopPolling();
  }, [importId, sessionId, target]);

  if (isDone) {
    const count = completeData?.importedCount ?? imported;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ScreenHeader title="Import Complete" subtitle="Farmers have been imported" />
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Import successful!</Text>
          <Text style={styles.successStat}>{count.toLocaleString()} farmers imported</Text>
          {completeData && completeData.duplicatesSkipped > 0 ? (
            <Text style={styles.successDetail}>{completeData.duplicatesSkipped} duplicates skipped</Text>
          ) : null}
          {completeData && completeData.errorsCount > 0 ? (
            <Text style={styles.successDetail}>{completeData.errorsCount} rows had errors</Text>
          ) : null}
        </View>
        <Button title="Done — back to Import" onPress={() => navigation.popToTop()} />
      </ScrollView>
    );
  }

  const remaining = Math.max(0, target - imported);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Importing..." subtitle={`Importing ${target.toLocaleString()} farmers`} />
      <View style={styles.progressCard}>
        <Text style={styles.progressPercent}>{progress}%</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
        </View>
        <Text style={styles.progressDetail}>
          {imported.toLocaleString()} imported, {remaining.toLocaleString()} remaining
        </Text>
      </View>
      {failed ? <Text style={styles.failedText}>Import failed. Please try again.</Text> : null}
      {target > 0 && imported >= target ? (
        <Button title="Done" onPress={() => navigation.popToTop()} style={styles.doneBtn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  progressCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 32,
    marginHorizontal: 16,
  },
  progressPercent: { fontSize: 48, fontWeight: '700', color: COLORS.primary },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: COLORS.border,
    borderRadius: 6,
    marginVertical: 16,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 6 },
  progressDetail: { fontSize: 14, color: COLORS.text },
  failedText: { color: COLORS.alert, textAlign: 'center', marginTop: 16, paddingHorizontal: 16 },
  doneBtn: { marginHorizontal: 16, marginTop: 16 },
  successCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: { fontSize: 48, color: COLORS.success },
  successTitle: { fontSize: 22, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  successStat: { fontSize: 18, color: COLORS.accent, fontWeight: '600', marginTop: 8 },
  successDetail: { fontSize: 14, color: COLORS.muted, marginTop: 4 },
});
