import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Divider, List, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { APP_BUILD } from '../../constants/build';
import { getFarmerDashboard, submitFarmerHelpRequest, updateFarmerProfilePhoto } from '../../api/client';
import { extractApiError, showMessage } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerHelpModal } from '../../components/farmer/FarmerHelpModal';
import { useAuthStore } from '../../store/authStore';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { FarmerVerificationStatusCard } from '../../components/farmer/FarmerVerificationStatusCard';
import { FarmerStatusChip } from '../../components/agent/FarmerStatusChip';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { taskStatusLabel, taskStatusVariant } from '../../utils/taskStatus';
import { formatFarmerStatus } from '../../utils/farmerStatus';
import { formatCleanDate, getLocalizedGreeting } from '../../utils/greeting';
import type { FarmerTabParamList } from '../../navigation/types';
import { useCurrency } from '../../context/CurrencyContext';
import { uploadPhotoToR2 } from '../../services/uploadToR2';

type SupportContacts = {
  fieldAgent?: {
    name: string;
    phone: string;
    aggregationCenter?: string | null;
    district?: string | null;
  } | null;
  aggregationCentre?: {
    centreId?: string;
    name: string;
    location?: string;
    managerName?: string | null;
    managerPhone?: string | null;
  } | null;
  bankingAgent?: {
    name: string;
    phone: string;
  } | null;
};

type ProfileTaskRow = {
  id: string;
  name: string;
  status?: string;
  due_date?: string | null;
  assigned_by_name?: string;
  program_project_name?: string;
  source?: string;
};

function profileTaskStatus(status?: string): string {
  return (status ?? 'not-started').replace(/_/g, '-');
}

type ProfileNav = BottomTabNavigationProp<FarmerTabParamList, 'Profile'>;

export function FarmerProfileScreen() {
  const navigation = useNavigation<ProfileNav>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { currency, currencyInfo, selectCountry } = useCurrency();
  const [farmer, setFarmer] = useState<{
    name: string;
    phone_number: string;
    country: string;
    district: string;
    sub_county: string;
    membership_group_name: string;
    aggregation_center: string | null;
    kb_farmer_id: string | null;
    picture_url: string | null;
    status: string;
    registered_agent_name?: string | null;
    registered_agent_phone?: string | null;
    centre_location?: string | null;
    banking_agent_name?: string | null;
    banking_agent_phone?: string | null;
  } | null>(null);
  const [contacts, setContacts] = useState<SupportContacts | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [assignedTasks, setAssignedTasks] = useState<ProfileTaskRow[]>([]);
  const [assignedTaskCount, setAssignedTaskCount] = useState(0);
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadProfile = useCallback(() => {
    getFarmerDashboard()
      .then((d) => {
        setFarmer(d.farmer);
        setContacts(d.contacts ?? null);
        setAssignedTasks((d.assignedTasks ?? d.recentTasks ?? []) as ProfileTaskRow[]);
        setAssignedTaskCount(
          typeof d.assignedTaskCount === 'number'
            ? d.assignedTaskCount
            : (d.assignedTasks ?? d.recentTasks ?? []).length
        );
        if (d.farmer?.country) selectCountry(d.farmer.country);
        setError(null);
        setTasksLoading(false);
      })
      .catch((err: unknown) => {
        setError(extractApiError(err, 'Could not load profile'));
        setAssignedTasks([]);
        setTasksLoading(false);
      });
  }, [selectCountry]);

  useFocusEffect(
    useCallback(() => {
      setTasksLoading(true);
      loadProfile();
      const interval = setInterval(loadProfile, 30000);
      return () => clearInterval(interval);
    }, [loadProfile])
  );

  const discardPendingPhoto = () => {
    setPendingUri(null);
    setPendingBase64(null);
  };

  /** Verification photos must be taken with the camera (not chosen from gallery). */
  const takeVerificationPhoto = async () => {
    if (picking || savingPhoto) return;
    setPicking(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showMessage(
          'Camera permission needed',
          'Allow camera access so you can take your verification photo.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          showMessage('Photo error', 'Could not read the image. Please try again.');
          return;
        }
        setPendingUri(asset.uri);
        setPendingBase64(asset.base64);
      }
    } catch (err: unknown) {
      showMessage(
        'Could not open camera',
        extractApiError(
          err,
          Platform.OS === 'web'
            ? 'Use a device with a camera, or allow camera access in the browser, then try again.'
            : 'Please try again.'
        )
      );
    } finally {
      setPicking(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!pendingUri || !pendingBase64) return;
    setSavingPhoto(true);
    try {
      const uploaded = await uploadPhotoToR2({
        purpose: 'farmer_profile',
        localUri: pendingUri,
        base64: pendingBase64,
      });
      const data = await updateFarmerProfilePhoto(uploaded.objectKey);
      setFarmer(data.farmer);
      setContacts(data.contacts ?? null);
      discardPendingPhoto();
      showMessage(
        'Photo submitted',
        'Your verification photo is saved. A field agent will confirm it matches you in person before your profile is fully verified.'
      );
    } catch (err: unknown) {
      showMessage('Could not save photo', extractApiError(err, 'Please try again.'));
    } finally {
      setSavingPhoto(false);
    }
  };

  const fieldAgentName =
    contacts?.fieldAgent?.name ?? farmer?.registered_agent_name ?? null;
  const fieldAgentPhone =
    contacts?.fieldAgent?.phone ?? farmer?.registered_agent_phone ?? null;
  const centreName =
    farmer?.aggregation_center ?? contacts?.aggregationCentre?.name ?? null;
  const centreLocation =
    contacts?.aggregationCentre?.location ?? farmer?.centre_location ?? null;
  const centreManager = contacts?.aggregationCentre?.managerName;
  const centrePhone =
    contacts?.aggregationCentre?.managerPhone ??
    contacts?.fieldAgent?.phone ??
    farmer?.registered_agent_phone;
  const bankingName =
    contacts?.bankingAgent?.name ?? farmer?.banking_agent_name ?? 'Payments desk';
  const bankingPhone =
    contacts?.bankingAgent?.phone ?? farmer?.banking_agent_phone ?? null;

  const displayName = farmer?.name ?? user?.name ?? 'Farmer';
  const country = farmer?.country ?? 'Kenya';
  const greeting = getLocalizedGreeting(country, displayName);
  const statusInfo = formatFarmerStatus(farmer?.status);
  const isVerified = (farmer?.status ?? '').toLowerCase().replace(/\s+/g, '_') === 'verified';

  const handleHelpSubmit = async (message: string) => {
    setHelpLoading(true);
    try {
      await submitFarmerHelpRequest(message);
      showMessage('Message sent', 'Your field agent will contact you soon.');
    } catch (err: unknown) {
      throw new Error(extractApiError(err, 'Could not send message'));
    } finally {
      setHelpLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-10">
      {error ? <FarmerOfflineBanner message={error} /> : null}
      <View className="mb-5 items-center rounded-[20px] bg-[#1A4D3E] p-6 pt-5">
        <Pressable
          onPress={() => void takeVerificationPhoto()}
          disabled={picking || savingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Take verification photo"
          style={styles.photoPressable}
        >
          {pendingUri ? (
            <View className="mb-1 items-center">
              <Image
                source={{ uri: pendingUri }}
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  borderWidth: 4,
                  borderColor: '#D4AF6A',
                }}
              />
              <Text className="mt-2 text-center text-xs text-white/80">Preview — not saved yet</Text>
            </View>
          ) : (
            <ProfileAvatar name={displayName} pictureUrl={farmer?.picture_url} size="hero" />
          )}
        </Pressable>
        {!pendingUri ? (
          <View className="mb-1 mt-2 w-full items-center gap-2">
            <Text className="text-center text-xs text-white/80">
              Use the camera to take a clear photo of your face. A field agent will verify it in person.
            </Text>
            <Pressable
              onPress={() => void takeVerificationPhoto()}
              disabled={picking || savingPhoto}
              style={({ pressed }) => [
                styles.takePhotoBtn,
                (picking || savingPhoto) && styles.takePhotoBtnDisabled,
                pressed && styles.takePhotoBtnPressed,
              ]}
            >
              {picking ? (
                <ActivityIndicator color="#1A4D3E" />
              ) : (
                <>
                  <Ionicons name="camera" size={18} color="#1A4D3E" />
                  <Text className="font-semibold text-[#1A4D3E]">
                    {farmer?.picture_url ? 'Retake verification photo' : 'Take verification photo'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
        {pendingUri ? (
          <View className="mb-3 mt-3 w-full flex-row gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 border-white/40"
              onPress={discardPendingPhoto}
              disabled={savingPhoto}
            >
              <Text className="text-white">Cancel</Text>
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 border-white/40"
              onPress={() => void takeVerificationPhoto()}
              disabled={savingPhoto || picking}
            >
              <Text className="text-white">Retake</Text>
            </Button>
            <Button
              className="h-11 flex-1 bg-[#D4AF6A]"
              onPress={() => void handleSavePhoto()}
              disabled={savingPhoto || picking}
            >
              {savingPhoto ? (
                <ActivityIndicator color="#1A4D3E" />
              ) : (
                <Text className="font-semibold text-[#1A4D3E]">Submit photo</Text>
              )}
            </Button>
          </View>
        ) : null}
        <View className="mb-3 mt-3 w-full items-center rounded-xl bg-white/10 p-3.5">
          <Text className="text-center text-[22px] font-bold leading-[30px] text-white">{greeting.primary}</Text>
          <Text className="mt-1.5 text-center text-sm text-white/85">{greeting.secondary}</Text>
          <Text className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#D4AF6A]">{greeting.languageName}</Text>
        </View>
        <Text className="mt-1 text-2xl font-bold text-white">{displayName}</Text>
        <Text className="mb-3 mt-1 text-center text-sm text-white/80">
          {[farmer?.district, farmer?.sub_county, country].filter(Boolean).join(' · ')}
        </Text>
        <View className="mt-2 w-full items-center">
          <FarmerStatusChip status={farmer?.status} centered />
          <Text className="mt-2 text-center text-xs text-white/85">{statusInfo.description}</Text>
        </View>
        <Text className="mt-2.5 text-xs font-semibold text-[#D4AF6A]">{currencyInfo.name} ({currency})</Text>
      </View>

      {farmer?.kb_farmer_id ? (
        <>
          <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Kilimo Bridge ID</Text>
          <View className="mb-5 items-center rounded-xl bg-white p-4">
            <Text className="text-xl font-bold tracking-wide text-[#1A4D3E]">{farmer.kb_farmer_id}</Text>
          </View>
        </>
      ) : null}

      <View className="mb-5">
        <FarmerVerificationStatusCard status={farmer?.status} />
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Cooperative</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <ProfileRow icon="business" label="Membership group" value={farmer?.membership_group_name} />
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Your support team</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <ProfileRow
          icon="person"
          label="Field agent"
          value={fieldAgentName ?? 'Not assigned yet'}
          subValue={fieldAgentPhone}
        />
        {(contacts?.fieldAgent?.aggregationCenter ?? fieldAgentName) ? (
          <>
            <Divider />
            <ProfileRow
              icon="storefront"
              label="Agent centre"
              value={contacts?.fieldAgent?.aggregationCenter ?? centreName ?? '—'}
            />
          </>
        ) : null}
        <Divider />
        <ProfileRow icon="location" label="Aggregation centre" value={centreName ?? 'Not set'} />
        {centreLocation ? (
          <>
            <Divider />
            <ProfileRow icon="map" label="Centre location" value={centreLocation} />
          </>
        ) : null}
        {centreManager || centrePhone ? (
          <>
            <Divider />
            <ProfileRow
              icon="call"
              label="Centre contact"
              value={centreManager ?? 'Centre manager'}
              subValue={centrePhone}
            />
          </>
        ) : null}
        <Divider />
        <ProfileRow
          icon="card"
          label="Banking / payments"
          value={bankingName}
          subValue={bankingPhone}
          hint="Contact for M-Pesa payment queries"
        />
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">
        Assigned tasks ({assignedTaskCount})
      </Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        {tasksLoading ? (
          <View className="items-center p-6">
            <ActivityIndicator color="#1A4D3E" />
          </View>
        ) : assignedTasks.length === 0 ? (
          <Text className="p-4 text-sm text-[#757575]">No tasks assigned yet.</Text>
        ) : (
          assignedTasks.slice(0, 5).map((task, index) => (
            <Pressable
              key={task.id}
              onPress={() =>
                navigation.navigate('Tasks', {
                  taskId: task.id,
                  highlightTaskId: task.id,
                })
              }
              className="p-4"
              style={
                index < assignedTasks.slice(0, 5).length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: '#eee' }
                  : undefined
              }
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-base font-semibold text-[#333333]">{task.name}</Text>
                {task.status ? (
                  <KBStatusChip
                    label={taskStatusLabel(profileTaskStatus(task.status))}
                    variant={taskStatusVariant(profileTaskStatus(task.status))}
                  />
                ) : null}
              </View>
              <Text className="mt-1 text-sm text-[#757575]">
                Assigned by: {task.assigned_by_name ?? 'Program team'}
              </Text>
              {task.program_project_name ? (
                <Text className="text-sm text-[#757575]">{task.program_project_name}</Text>
              ) : null}
              <Text className="mt-1 text-sm text-[#1A4D3E]">
                Due: {task.due_date ? formatCleanDate(task.due_date) : 'No due date'}
              </Text>
            </Pressable>
          ))
        )}
        {assignedTasks.length > 0 ? (
          <Pressable
            className="border-t border-[#eee] p-4"
            onPress={() => navigation.navigate('Tasks')}
          >
            <Text className="text-center text-sm font-semibold text-[#1A4D3E]">
              View all tasks →
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Contact</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <ProfileRow icon="call" label="Phone" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="phone-portrait" label="M-Pesa" value={farmer?.phone_number ?? user?.phoneNumber} verified />
        <Divider />
        <ProfileRow icon="shield-checkmark" label="National ID" value={isVerified ? 'Verified on file' : 'Pending verification'} verified={isVerified} />
      </View>

      <Text className="mb-2 ml-1 text-sm font-semibold text-[#757575]">Settings</Text>
      <View className="mb-5 overflow-hidden rounded-xl bg-white">
        <List.Item
          title="Push notifications"
          left={(props) => <List.Icon {...props} icon="bell" color="#1A4D3E" />}
          right={() => (
            <Switch value={notifications} onValueChange={setNotifications} color="#1A4D3E" />
          )}
        />
      </View>

      <Button className="mb-3 h-12 bg-[#D4AF6A]" onPress={() => setHelpOpen(true)}>
        <View className="flex-row items-center gap-2">
          <Ionicons name="help-buoy-outline" size={20} color="#1A4D3E" />
          <Text className="font-semibold text-[#1A4D3E]">Need help? Contact field agent</Text>
        </View>
      </Button>

      <Button variant="outline" className="mt-2 border-[#D32F2F]" onPress={logout}>
        <Text className="text-[#D32F2F]">Sign Out</Text>
      </Button>
      <Text className="mt-4 text-center text-xs text-[#757575]">Kilimo Bridge {APP_BUILD}</Text>

      <FarmerHelpModal
        visible={helpOpen}
        agentName={fieldAgentName ?? undefined}
        loading={helpLoading}
        onClose={() => setHelpOpen(false)}
        onSubmit={handleHelpSubmit}
      />
    </ScrollView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  subValue,
  hint,
  verified,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  subValue?: string | null;
  hint?: string;
  verified?: boolean;
}) {
  return (
    <View className="p-4">
      <View className="flex-row items-center">
        <Ionicons name={icon} size={20} color="#1A4D3E" style={{ marginRight: 12 }} />
        <View className="flex-1">
          <Text className="text-xs text-[#757575]">{label}</Text>
          <Text className="mt-0.5 text-[15px] font-medium text-[#333333]">{value ?? '—'}</Text>
          {subValue ? <Text className="mt-0.5 text-sm text-[#1A4D3E]">{subValue}</Text> : null}
          {hint ? <Text className="mt-1 text-[11px] text-[#757575]">{hint}</Text> : null}
        </View>
        {verified ? <Ionicons name="checkmark-circle" size={18} color="#2E7D5E" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoPressable: {
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  takePhotoBtn: {
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#D4AF6A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  takePhotoBtnDisabled: {
    opacity: 0.65,
  },
  takePhotoBtnPressed: {
    opacity: 0.9,
  },
});
