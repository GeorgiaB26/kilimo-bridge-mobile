import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { APP_BUILD } from '../../constants/build';
import { confirmCsvImport, getImportProgress, getImportComplete } from '../../api/client';
import { showMessage } from '../../utils/feedback';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvImport'>;

export function CsvImportScreen({ navigation, route }: Props) {
  const { sessionId, willImport } = route.params;
  const target = Number(willImport) || 0;

  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [failed, setFailed] = useState(false);
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertedRef = useRef(false);

  const isDone = target > 0 && imported >= target;

  useEffect(() => {
    if (!isDone || alertedRef.current) return;
    alertedRef.current = true;
    showMessage(
      'Import successful!',
      `${imported.toLocaleString()} farmers have been imported and can now log in with their phone numbers.`
    );
  }, [isDone, imported]);

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
    if (!importId || isDone) return;

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const prog = await getImportProgress(sessionId, importId);
        const count = prog.importedCount;
        setProgress(prog.percentComplete);
        setImported(count);

        const finished =
          prog.status === 'complete' ||
          (target > 0 && count >= target) ||
          prog.percentComplete >= 100;

        if (finished) {
          stopPolling();
          setProgress(100);
          setImported(Math.max(count, target));
          try {
            const complete = await getImportComplete(sessionId);
            if (complete) setDuplicatesSkipped(complete.duplicatesSkipped ?? 0);
          } catch {
            // counts from progress are enough
          }
        }
      } catch {
        // keep polling
      }
    };

    intervalRef.current = setInterval(poll, 500);
    poll();
    return () => stopPolling();
  }, [importId, sessionId, target, isDone]);

  const remaining = Math.max(0, target - imported);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isDone ? (
        <>
          <ScreenHeader title="Import Complete" subtitle="Farmers have been imported" />
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Import successful!</Text>
            <Text style={styles.successStat}>{imported.toLocaleString()} farmers imported</Text>
            {duplicatesSkipped > 0 ? (
              <Text style={styles.successDetail}>{duplicatesSkipped} duplicates were skipped</Text>
            ) : null}
          </View>
          <Button title="Done — back to Import" onPress={() => navigation.popToTop()} />
        </>
      ) : (
        <>
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
        </>
      )}
      <Text style={styles.buildTag}>Screen build {APP_BUILD}</Text>
    </ScrollView>
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
    marginTop: 16,
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
  failedText: { color: COLORS.alert, textAlign: 'center', marginTop: 16 },
  successCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  successIcon: { fontSize: 56, color: COLORS.success },
  successTitle: { fontSize: 24, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  successStat: { fontSize: 20, color: COLORS.accent, fontWeight: '600', marginTop: 12 },
  successDetail: { fontSize: 14, color: COLORS.muted, marginTop: 8 },
  buildTag: { fontSize: 11, color: COLORS.muted, textAlign: 'center', marginTop: 24 },
});
