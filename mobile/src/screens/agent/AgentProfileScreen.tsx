import React, { useCallback, useState } from 'react';
import { View, ScrollView, Linking, Alert, Modal, Pressable, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FileText,
  Info,
  MessageCircle,
  Phone,
  Star,
  X,
} from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '../../store/authStore';
import { getAgentDashboard, getNotificationSettings, updateNotificationSettings } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { KBCard } from '../../components/ui/KBCard';
import { MessagesNotificationsHeaderIcons } from '../../components/messaging/MessagesNotificationsHeaderIcons';

const USEFUL_DOCUMENTS = [
  { name: 'User Guide v2.1', size: '2.3 MB', type: 'PDF' },
  { name: 'Payment Instructions', size: '1.1 MB', type: 'PDF' },
  { name: 'Task Management Best Practices', size: '890 KB', type: 'PDF' },
  { name: 'Farmer Registration Checklist', size: '450 KB', type: 'PDF' },
  { name: 'Common Issues & Solutions', size: '1.5 MB', type: 'PDF' },
];

export function AgentProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [pm, setPm] = useState<{ name: string; phone: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editPhone, setEditPhone] = useState(user?.phoneNumber ?? '');
  const [pushOn, setPushOn] = useState(true);
  const [remindersOn, setRemindersOn] = useState(true);
  const [messagesOn, setMessagesOn] = useState(true);
  const [paymentsOn, setPaymentsOn] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAgentDashboard();
      setPm(data.project_manager ?? null);
    } catch {
      setPm(null);
    }
    try {
      const notif = await getNotificationSettings();
      const s = notif.settings;
      setPushOn(Boolean(s.push_enabled));
      setRemindersOn(Boolean(s.notify_task_assigned));
      setMessagesOn(Boolean(s.messages_enabled));
      setPaymentsOn(Boolean(s.notify_payment_updates));
      setSettingsError(null);
    } catch {
      /* keep local defaults */
    }
  }, []);

  const toggleSetting = async (
    key: 'push_enabled' | 'notify_task_assigned' | 'messages_enabled' | 'notify_payment_updates',
    next: boolean
  ) => {
    const snapshot = { push: pushOn, reminders: remindersOn, messages: messagesOn, payments: paymentsOn };
    if (key === 'push_enabled') setPushOn(next);
    if (key === 'notify_task_assigned') setRemindersOn(next);
    if (key === 'messages_enabled') setMessagesOn(next);
    if (key === 'notify_payment_updates') setPaymentsOn(next);
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const data = await updateNotificationSettings({ [key]: next });
      const s = data.settings;
      setPushOn(Boolean(s.push_enabled));
      setRemindersOn(Boolean(s.notify_task_assigned));
      setMessagesOn(Boolean(s.messages_enabled));
      setPaymentsOn(Boolean(s.notify_payment_updates));
    } catch (err) {
      setPushOn(snapshot.push);
      setRemindersOn(snapshot.reminders);
      setMessagesOn(snapshot.messages);
      setPaymentsOn(snapshot.payments);
      setSettingsError(extractApiError(err, 'Could not save notification setting'));
    } finally {
      setSettingsSaving(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const callPhone = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const submitProfileRequest = () => {
    Alert.alert(
      'Request submitted',
      'Your profile change request has been sent to your Project Manager for approval. Changes will apply once approved.'
    );
    setSettingsOpen(false);
  };

  return (
    <>
      <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-10">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-[22px] font-bold text-[#1A4D3E]">Profile</Text>
          <View className="flex-row items-center gap-1">
            <MessagesNotificationsHeaderIcons iconColor="#1A4D3E" />
            <Pressable onPress={() => setSettingsOpen(true)} accessibilityLabel="Settings">
              <Ionicons name="settings-outline" size={26} color="#1A4D3E" />
            </Pressable>
          </View>
        </View>

        <View className="mb-4 items-center rounded-xl bg-white p-5">
          <View className="mb-3 h-20 w-20 items-center justify-center rounded-full bg-[#1A4D3E]">
            <Text className="text-2xl font-bold text-[#D4AF6A]">
              {user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text className="text-xl font-bold text-[#333333]">{user?.name}</Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <CircleCheck size={14} color="#2E7D5E" />
            <Text className="text-sm text-[#2E7D5E]">Active · Field Agent</Text>
          </View>
        </View>

        <KBCard style={{ marginBottom: 12 }}>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
            Contact information
          </Text>
          <Row label="Phone" value={user?.phoneNumber} highlight />
          <View className="flex-row items-center gap-1.5">
            <Star size={14} color="#757575" />
            <Text className="text-xs text-[#757575]">Payment method</Text>
          </View>
        </KBCard>

        <KBCard style={{ marginBottom: 12 }}>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
            Area of coverage
          </Text>
          <Row label="Country" value="Kenya" />
          <Row label="Region" value={user?.region ?? user?.district} />
          <Row label="District" value={user?.district} />
          <Row label="Aggregation centre" value={user?.aggregationCenter} />
        </KBCard>

        <KBCard style={{ marginBottom: 12 }}>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
            Project manager
          </Text>
          {pm ? (
            <>
              <Row label="Name" value={pm.name} />
              <Row label="Phone" value={pm.phone} />
              <View className="mt-3 flex-row gap-2">
                <Button variant="outline" className="flex-1 h-10" onPress={() => callPhone(pm.phone)}>
                  <View className="flex-row items-center gap-1.5">
                    <Phone size={16} color="#1A4D3E" />
                    <Text>Call PM</Text>
                  </View>
                </Button>
                <Button variant="outline" className="flex-1 h-10" onPress={() => callPhone(pm.phone)}>
                  <View className="flex-row items-center gap-1.5">
                    <MessageCircle size={16} color="#1A4D3E" />
                    <Text>Message PM</Text>
                  </View>
                </Button>
              </View>
              <Button
                variant="ghost"
                className="mt-2"
                onPress={() => Alert.alert('Get help', 'Contact your PM for support with registrations, tasks, or payments.')}
              >
                <View className="flex-row items-center gap-1.5">
                  <CircleHelp size={16} color="#1A4D3E" />
                  <Text className="text-[#1A4D3E]">Get help</Text>
                  <ChevronRight size={16} color="#1A4D3E" />
                </View>
              </Button>
            </>
          ) : (
            <Text className="text-sm text-[#757575]">PM contact will appear when assigned.</Text>
          )}
        </KBCard>

        <KBCard style={{ marginBottom: 12 }}>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
            Useful documents
          </Text>
          {USEFUL_DOCUMENTS.map((doc) => (
            <View key={doc.name} className="mb-3 border-b border-[#F0F0F0] pb-3">
              <View className="flex-row items-center gap-1.5">
                <FileText size={16} color="#333333" />
                <Text className="font-semibold text-[#333333]">{doc.name}</Text>
              </View>
              <Text className="text-xs text-[#757575]">{doc.type} · {doc.size}</Text>
              <View className="mt-2 flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-8"
                  onPress={() => Alert.alert('Download', `${doc.name} will be available in a future update.`)}
                >
                  <Text className="text-xs">Download</Text>
                </Button>
                <Button
                  variant="outline"
                  className="h-8"
                  onPress={() => Alert.alert('Share', `${doc.name} sharing coming soon.`)}
                >
                  <Text className="text-xs">Share</Text>
                </Button>
              </View>
            </View>
          ))}
          <Button
            variant="ghost"
            onPress={() => Alert.alert('Request document', 'Ask your PM to upload new documents via the admin portal.')}
          >
            <Text className="text-[#1A4D3E]">+ Request document</Text>
          </Button>
        </KBCard>

        <KBCard style={{ marginBottom: 12 }}>
          <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
            Notifications
          </Text>
          {settingsError ? (
            <View className="mb-2 rounded-md border border-[#D32F2F] bg-[#FFEBEE] px-3 py-2">
              <Text className="text-xs text-[#D32F2F]">{settingsError}</Text>
            </View>
          ) : null}
          <ToggleRow
            label="Push notifications"
            value={pushOn}
            disabled={settingsSaving}
            onChange={(v) => toggleSetting('push_enabled', v)}
          />
          <ToggleRow
            label="Task reminders"
            value={remindersOn}
            disabled={settingsSaving}
            onChange={(v) => toggleSetting('notify_task_assigned', v)}
          />
          <ToggleRow
            label="Messages"
            value={messagesOn}
            disabled={settingsSaving}
            onChange={(v) => toggleSetting('messages_enabled', v)}
          />
          <ToggleRow
            label="Payment updates"
            value={paymentsOn}
            disabled={settingsSaving}
            onChange={(v) => toggleSetting('notify_payment_updates', v)}
          />
        </KBCard>

        <Button variant="outline" onPress={logout}>
          <Text>Sign out</Text>
        </Button>
      </ScrollView>

      <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-2xl bg-white p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold">Edit profile</Text>
              <Pressable onPress={() => setSettingsOpen(false)}>
                <X size={24} color="#757575" />
              </Pressable>
            </View>
            <View className="mb-3 flex-row items-start gap-1.5">
              <Info size={16} color="#757575" style={{ marginTop: 2 }} />
              <Text className="flex-1 text-sm text-[#757575]">
                Changes require PM approval before they apply in the system.
              </Text>
            </View>
            <TextInput label="Name" value={editName} onChangeText={setEditName} mode="outlined" style={{ marginBottom: 12 }} />
            <TextInput label="Phone" value={editPhone} onChangeText={setEditPhone} mode="outlined" style={{ marginBottom: 12 }} />
            <Text className="mb-2 text-sm font-semibold text-[#757575]">Area of coverage (read-only)</Text>
            <Text className="mb-4 text-[#333333]">{user?.district ?? user?.region ?? '—'}</Text>
            <Button className="mb-2 h-11 bg-[#1A4D3E]" onPress={submitProfileRequest}>
              <Text className="text-white">Submit request</Text>
            </Button>
            <Button variant="outline" onPress={() => setSettingsOpen(false)}>
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-[#757575]">{label}</Text>
      <Text className={highlight ? 'font-bold text-[#1A4D3E]' : 'font-medium text-[#333333]'}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-[#333333]">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: '#1A4D3E' }}
      />
    </View>
  );
}
