import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Alert,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  ActionSheetIOS,
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
import { getFarmerDashboard, getFarmerHierarchyTasks, submitFarmerHelpRequest, updateFarmerProfilePhoto } from '../../api/client';
import { extractApiError } from '../../utils/feedback';
import { FarmerOfflineBanner } from '../../components/farmer/FarmerOfflineBanner';
import { FarmerHelpModal } from '../../components/farmer/FarmerHelpModal';
import { useAuthStore } from '../../store/authStore';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { FarmerVerificationStatusCard } from '../../components/farmer/FarmerVerificationStatusCard';
import { FarmerStatusChip } from '../../components/agent/FarmerStatusChip';
import { formatFarmerStatus } from '../../utils/farmerStatus';
import { formatCleanDate } from '../../utils/greeting';
import type { FarmerTabParamList } from '../../navigation/types';
import { useCurrency } from '../../context/CurrencyContext';
import { uploadPhotoToR2 } from '../../services/uploadToR2';
import { MessagesNotificationsHeaderIcons } from '../../components/messaging/MessagesNotificationsHeaderIcons';

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
  const [tasksLoading, setTasksLoading] = useState(true);

  const loadProfile = useCallback(() => {
    getFarmerDashboard()
      .then((d) => {
        setFarmer(d.farmer);
        setContacts(d.contacts ?? null);
        if (d.farmer?.country) selectCountry(d.farmer.country);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(extractApiError(err, 'Could not load profile'));
      });

    setTasksLoading(true);
    getFarmerHierarchyTasks()
      .then((data) => {
        setAssignedTasks((data.tasks ?? []) as ProfileTaskRow[]);
      })
      .catch(() => {
        setAssignedTasks([]);
      })
      .finally(() => setTasksLoading(false));
  }, [selectCountry]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const discardPendingPhoto = () => {
    setPendingUri(null);
    setPendingBase64(null);
  };

  const pickImage = async (useCamera: boolean) => {
    setPicking(true);
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera/gallery access to update your photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
            base64: true,
          });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          Alert.alert('Photo error', 'Could not read image. Please try again.');
          return;
        }
        setPendingUri(asset.uri);
        setPendingBase64(asset.base64);
      }
    } finally {
      setPicking(false);
    }
  };

  const promptChangePhoto = () => {
    if (picking || savingPhoto) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Gallery'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) void pickImage(true);
          if (index === 2) void pickImage(false);
        }
      );
      return;
    }
    Alert.alert('Change photo', 'Choose a source', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: () => void pickImage(true) },
      { text: 'Choose from Gallery', onPress: () => void pickImage(false) },
    ]);
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
      Alert.alert('Photo saved', 'Your profile photo has been updated.');
    } catch (err: unknown) {
      Alert.alert('Could not save photo', extractApiError(err, 'Please try again.'));
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
      Alert.alert('Message sent', 'Your field agent will contact you soon.');
    } catch (err: unknown) {
      throw new Error(extractApiError(err, 'Could not send message'));
    } finally {
      setHelpLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-10">
      {error ? <FarmerOfflineBanner message={error} /> : null}
      <View className="mb-2 flex-row items-center justify-end">
        <MessagesNotificationsHeaderIcons iconColor="#1A4D3E" />
      </View>
      <View className="mb-5 items-center rounded-[20px] bg-[#1A4D3E] p-6 pt-5">
        <Pressable
          onPress={promptChangePhoto}
          disabled={picking || savingPhoto}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
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
          <Pressable onPress={promptChangePhoto} disabled={picking || savingPhoto} className="mb-1 mt-1">
            <Text className="text-center text-xs font-semibold text-[#D4AF6A]">
              {picking ? 'Opening camera…' : 'Tap photo to change'}
            </Text>
          </Pressable>
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
              onPress={() => void pickImage(true)}
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
                <Text className="font-semibold text-[#1A4D3E]">Save photo</Text>
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
        <View className="mt-2 items-center">
          <FarmerStatusChip status={farmer?.status} />
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
        Assigned tasks ({assignedTasks.length})
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
                navigation.navigate('Tasks', { highlightTaskId: task.id })
              }
              className="p-4"
              style={
                index < assignedTasks.slice(0, 5).length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: '#eee' }
                  : undefined
              }
            >
              <Text className="text-base font-semibold text-[#333333]">{task.name}</Text>
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
