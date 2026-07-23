import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  const [status, setStatus] = useState<'starting' | 'in_progress' | 'complete' | 'failed'>('starting');
  const [completeData, setCompleteData] = useState<{
    importedCount: number;
    duplicatesSkipped: number;
    errorsCount: number;
    errors: Array<{ row: number; field: string; error: string }>;
  } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const startImport = async () => {
      try {
        const result = await confirmCsvImport(sessionId, true);
        setImportId(result.importId);
        setStatus('in_progress');
      } catch {
        setStatus('failed');
      }
    };
    startImport();
  }, [sessionId]);

  useEffect(() => {
    if (!importId || status !== 'in_progress') return;

    let cancelled = false;

    const poll = async () => {
      try {
        const prog = await getImportProgress(sessionId, importId);
        if (cancelled) return;
        setProgress(prog.percentComplete);
        setImported(prog.importedCount);

        const finished =
          prog.status === 'complete' ||
          (prog.percentComplete >= 100 && prog.importedCount >= willImport);

        if (finished) {
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const complete = await getImportComplete(sessionId);
              if (complete) {
                setCompleteData(complete);
                setStatus('complete');
                return;
              }
            } catch {
              // DB may still be finishing — retry
            }
            await new Promise((r) => setTimeout(r, 400));
          }
          // Progress done but /complete unavailable — still show success
          setCompleteData({
            importedCount: prog.importedCount,
            duplicatesSkipped: 0,
            errorsCount: 0,
            errors: [],
          });
          setStatus('complete');
        }
      } catch {
        // keep polling
      }
    };

    intervalRef.current = setInterval(poll, 1000);
    poll();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [importId, sessionId, status, willImport]);

  const showSuccess =
    status === 'complete' &&
    (completeData !== null || (progress >= 100 && imported >= willImport && willImport > 0));

  if (showSuccess) {
    const count = completeData?.importedCount ?? imported;
    return (
      <View style={styles.container}>
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
        {completeData && completeData.errors.length > 0 ? (
          <View style={styles.errorList}>
            <Text style={styles.errorTitle}>Error Report</Text>
            {completeData.errors.slice(0, 10).map((err, i) => (
              <Text key={i} style={styles.errorItem}>
                Row {err.row}: {err.field} — {err.error}
              </Text>
            ))}
          </View>
        ) : null}
        <Button title="Done" onPress={() => navigation.popToTop()} />
      </View>
    );
  }

  const remaining = Math.max(0, willImport - imported);
  const etaMinutes = remaining > 0 ? Math.ceil(remaining / 50 / 60) : 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Importing..." subtitle={`Importing ${willImport.toLocaleString()} farmers`} />
      <View style={styles.progressCard}>
        <Text style={styles.progressPercent}>{progress}%</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressDetail}>
          {imported.toLocaleString()} imported, {remaining.toLocaleString()} remaining
        </Text>
        {etaMinutes > 0 ? (
          <Text style={styles.eta}>About {etaMinutes} minute{etaMinutes !== 1 ? 's' : ''}</Text>
        ) : null}
      </View>
      {status === 'failed' ? (
        <Text style={styles.failedText}>Import failed. Please try again.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  progressCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginTop: 32,
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
  eta: { fontSize: 13, color: COLORS.muted, marginTop: 8 },
  failedText: { color: COLORS.alert, textAlign: 'center', marginTop: 16 },
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
  errorList: { marginBottom: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: COLORS.alert, marginBottom: 8 },
  errorItem: { fontSize: 12, color: COLORS.alert, marginBottom: 4 },
});
