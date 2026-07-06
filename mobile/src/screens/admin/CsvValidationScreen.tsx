import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { COLORS } from '../../constants';
import { validateCsvImportText } from '../../api/client';
import type { ImportValidationResult } from '../../types';
import type { ImportStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ImportStackParamList, 'CsvValidation'>;

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    valid: COLORS.success,
    invalid: COLORS.alert,
    duplicate: COLORS.accent,
  };
  return (
    <Text style={[styles.badge, { color: colors[status] ?? COLORS.muted }]}>
      {status === 'valid' ? '✓ Valid' : status === 'duplicate' ? '⊘ Duplicate' : '✗ Invalid'}
    </Text>
  );
}

export function CsvValidationScreen({ navigation, route }: Props) {
  const { fileName, fileContent } = route.params;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ImportValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const runValidation = async () => {
      try {
        const data = await validateCsvImportText(fileContent);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Validating {fileName}...</Text>
      </View>
    );
  }

  if (error || !result) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Validation failed'}</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ScreenHeader title="Validation Results" subtitle={fileName} />
      {!result.headersMatch && result.columnMapping ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Column mapping applied</Text>
          <Text style={styles.warningText}>
            Headers did not match exactly. Auto-mapped columns were used.
          </Text>
        </View>
      ) : null}
      <View style={styles.statsRow}>
        <StatCard label="Total Rows" value={result.totalRows} />
        <StatCard label="Valid" value={result.validRows} color={COLORS.success} />
        <StatCard label="Issues" value={result.invalidRows} color={COLORS.alert} />
        <StatCard label="Duplicates" value={result.duplicates} color={COLORS.accent} />
      </View>
      <Text style={styles.importCount}>
        Will import: <Text style={styles.importNumber}>{result.willImport.toLocaleString()}</Text> farmers
      </Text>
      <Text style={styles.sectionTitle}>Preview (first 10 rows)</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Name</Text>
          <Text style={[styles.cell, styles.headerCell, { flex: 2 }]}>Phone</Text>
          <Text style={[styles.cell, styles.headerCell]}>District</Text>
          <Text style={[styles.cell, styles.headerCell]}>Status</Text>
        </View>
        {result.preview.map((row, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{row.name}</Text>
            <Text style={[styles.cell, { flex: 2 }]} numberOfLines={1}>{row.phone}</Text>
            <Text style={styles.cell} numberOfLines={1}>{row.district}</Text>
            <StatusBadge status={row.status} />
          </View>
        ))}
      </View>
      {result.errors.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Errors ({result.errors.length})</Text>
          {result.errors.slice(0, 20).map((err, i) => (
            <View key={i} style={styles.errorRow}>
              <Text style={styles.errorRowText}>
                Row {err.row}: {err.field} — {err.error}
                {err.suggestion ? ` (${err.suggestion})` : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}
      <View style={styles.actions}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button
          title={`Import ${result.willImport} Farmers`}
          onPress={() => navigation.navigate('CsvImport', { sessionId: result.sessionId, willImport: result.willImport })}
          disabled={result.willImport === 0}
          style={styles.half}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 16, color: COLORS.muted, fontSize: 16 },
  errorText: { color: COLORS.alert, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  warningCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
  },
  warningTitle: { fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  warningText: { fontSize: 13, color: COLORS.muted },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  statLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  importCount: { fontSize: 16, color: COLORS.text, marginBottom: 16, textAlign: 'center' },
  importNumber: { fontWeight: '700', color: COLORS.accent, fontSize: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  table: { borderRadius: 8, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, padding: 8 },
  headerCell: { color: '#fff', fontWeight: '600', fontSize: 12 },
  tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  cell: { fontSize: 12, color: COLORS.text, flex: 1 },
  badge: { fontSize: 11, fontWeight: '600', flex: 1 },
  errorRow: { backgroundColor: '#FFEBEE', padding: 8, borderRadius: 4, marginBottom: 4 },
  errorRowText: { fontSize: 12, color: COLORS.alert },
  actions: { flexDirection: 'row', gap: 12, marginVertical: 24 },
  half: { flex: 1 },
});
