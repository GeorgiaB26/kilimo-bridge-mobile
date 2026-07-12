import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Button, Surface, TextInput } from 'react-native-paper';
import { PickerField } from './PickerField';
import { COLORS } from '../constants';
import {
  getCountryConfig,
  getCountryCode,
  getLevel1Options,
  getLevel2Options,
  getLevel3Options,
} from '../constants/regional';
import { updateFarmerLocation } from '../api/client';

interface FarmerLocationPromptProps {
  country: string;
  visible: boolean;
  onCompleted: () => void;
}

export function FarmerLocationPrompt({ country, visible, onCompleted }: FarmerLocationPromptProps) {
  const [district, setDistrict] = useState('');
  const [subCounty, setSubCounty] = useState('');
  const [parish, setParish] = useState('');
  const [village, setVillage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const countryConfig = getCountryConfig(country);
  const countryCode = getCountryCode(country);
  const labels = countryConfig?.levelLabels ?? ['Region', 'Sub-Region', 'Area', 'Village'];

  const level1Options = useMemo(
    () => (countryCode ? getLevel1Options(countryCode) : []),
    [countryCode]
  );
  const level2Options = useMemo(
    () => (countryCode && district ? getLevel2Options(countryCode, district) : []),
    [countryCode, district]
  );
  const level3Options = useMemo(
    () => (countryCode && district && subCounty ? getLevel3Options(countryCode, district, subCounty) : []),
    [countryCode, district, subCounty]
  );

  const handleSave = async () => {
    setError(null);
    if (!district || !subCounty) {
      setError(`Please select your ${labels[0]} and ${labels[1]}.`);
      return;
    }
    setSaving(true);
    try {
      await updateFarmerLocation({ district, subCounty, parish: parish || undefined, village: village || undefined });
      onCompleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Complete your location</Text>
        <Text style={styles.subtitle}>
          Your cooperative imported your profile. Please confirm where you farm in {country} so we can assign the right aggregation centre.
        </Text>
        <Surface style={styles.card} elevation={1}>
          <PickerField
            label={labels[0]}
            value={district}
            options={level1Options}
            onSelect={(value) => {
              setDistrict(value);
              setSubCounty('');
              setParish('');
            }}
            required
          />
          <PickerField
            label={labels[1]}
            value={subCounty}
            options={level2Options}
            onSelect={(value) => {
              setSubCounty(value);
              setParish('');
            }}
            required
          />
          {level3Options.length > 0 ? (
            <PickerField
              label={labels[2]}
              value={parish}
              options={level3Options}
              onSelect={setParish}
            />
          ) : null}
          <TextInput
            label={labels[3] ?? 'Village'}
            value={village}
            onChangeText={setVillage}
            mode="outlined"
            style={styles.input}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
          />
        </Surface>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button mode="contained" onPress={handleSave} loading={saving} buttonColor={COLORS.primary} style={styles.btn}>
          Save location
        </Button>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.primary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: COLORS.muted, lineHeight: 22, marginBottom: 20 },
  card: { padding: 16, borderRadius: 12, backgroundColor: COLORS.background, marginBottom: 16 },
  error: { color: COLORS.alert, marginBottom: 12 },
  input: { marginTop: 8, backgroundColor: COLORS.background },
  btn: { borderRadius: 12 },
});
