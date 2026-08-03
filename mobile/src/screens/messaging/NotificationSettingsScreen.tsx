import React, { useCallback, useState } from 'react';
import { View, ScrollView, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { COLORS } from '../../constants';
import { getNotificationSettings, updateNotificationSettings } from '../../api/client';
import { extractApiError } from '../../utils/feedback';

type Settings = {
  messages_enabled: boolean;
  task_assignments_enabled: boolean;
  payment_updates_enabled: boolean;
  verification_updates_enabled: boolean;
  notify_messages: boolean;
  notify_task_assigned: boolean;
  notify_payment_updates: boolean;
  notify_help_requests: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  push_enabled: boolean;
};

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#ccc', true: COLORS.primary }}
      />
    </View>
  );
}

export function NotificationSettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getNotificationSettings();
      setSettings(data.settings as Settings);
      setError(null);
    } catch (err) {
      setError(extractApiError(err, 'Could not load settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async (key: keyof Settings, value: boolean) => {
    if (!settings) return;
    const prev = settings[key];
    setSettings({ ...settings, [key]: value });
    try {
      const data = await updateNotificationSettings({ [key]: value });
      setSettings(data.settings as Settings);
    } catch {
      setSettings({ ...settings, [key]: prev as boolean });
      setError('Could not save setting');
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loader} color={COLORS.primary} />;
  }

  if (!settings) {
    return <Text style={styles.error}>{error ?? 'Settings unavailable'}</Text>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Notification Settings</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>In-app</Text>
      <ToggleRow label="Messages" value={settings.messages_enabled} onChange={(v) => toggle('messages_enabled', v)} />
      <ToggleRow
        label="Task assignments"
        value={settings.task_assignments_enabled}
        onChange={(v) => toggle('task_assignments_enabled', v)}
      />
      <ToggleRow
        label="Payment updates"
        value={settings.payment_updates_enabled}
        onChange={(v) => toggle('payment_updates_enabled', v)}
      />
      <ToggleRow
        label="Verification updates"
        value={settings.verification_updates_enabled}
        onChange={(v) => toggle('verification_updates_enabled', v)}
      />

      <Text style={styles.section}>Alerts</Text>
      <ToggleRow label="Push notifications" value={settings.push_enabled} onChange={(v) => toggle('push_enabled', v)} />
      <ToggleRow
        label="Help requests"
        value={settings.notify_help_requests}
        onChange={(v) => toggle('notify_help_requests', v)}
      />

      <Text style={styles.section}>Quiet hours</Text>
      <ToggleRow
        label="Quiet hours enabled"
        value={settings.quiet_hours_enabled}
        onChange={(v) => toggle('quiet_hours_enabled', v)}
      />
      <Text style={styles.quietNote}>
        {settings.quiet_hours_start && settings.quiet_hours_end
          ? `${settings.quiet_hours_start} – ${settings.quiet_hours_end}`
          : '22:00 – 07:00 (configure in portal)'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7f6' },
  content: { padding: 16, paddingBottom: 32 },
  header: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8ecea',
  },
  rowLabel: { fontSize: 15, flex: 1 },
  quietNote: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  loader: { marginTop: 40 },
  error: { color: '#c0392b', marginBottom: 8 },
});
