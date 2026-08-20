import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Alert, Image, Pressable, StyleSheet, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import {
  CircleCheck,
  Hourglass,
  Square,
  SquareCheck,
} from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getAgentFarmerById, getAdminFarmerTasks, reviewFarmerProfilePhoto } from '../../api/client';
import { FarmerStatusChip } from '../../components/agent/FarmerStatusChip';
import { VerifyFarmerModal } from '../../components/agent/VerifyFarmerModal';
import { FarmerProfilePhoto } from '../../components/FarmerProfilePhoto';
import { OutboxFarmerVerificationCard } from '../../components/OutboxFarmerVerificationCard';
import { isUsableFarmerPhotoUrl } from '../../../shared/src/farmerPhoto';
import { formatFarmerStatus } from '../../utils/farmerStatus';
import { formatCleanDate } from '../../utils/greeting';
import { extractApiError } from '../../utils/feedback';
import { useAuthStore } from '../../store/authStore';
import type { AgentFarmersStackParamList } from '../../navigation/types';
import {
  dismissFarmerVerificationOutbox,
  listPendingFarmerVerifications,
  pushPendingFarmerVerification,
  submitFarmerVerificationWithOutbox,
  syncAllPendingFarmerVerifications,
  type PendingFarmerVerificationView,
} from '../../services/submitFarmerVerificationOutbox';

type Props = NativeStackScreenProps<AgentFarmersStackParamList, 'FarmerProfile'>;

type FarmerDetail = {
  farmer_id: string;
  name: string;
  phone_number: string;
  gender: string;
  country: string;
  district: string;
  sub_county: string;
  parish?: string;
  village?: string;
  membership_group_name: string;
  membership_type: string;
  occupation?: string;
  size_of_land?: number | string;
  aggregation_center?: string;
  aggregation_centre_contact?: string;
  centre_location_level_1?: string;
  centre_location_level_2?: string;
  picture_url?: string | null;
  pending_picture_url?: string | null;
  status: string;
  key?: string;
  created_at?: string;
  registered_agent_name?: string;
  registered_agent_phone?: string;
  registered_agent_user_id?: string;
  projects?: Array<{ project_name: string; status: string }>;
  tasks_completed?: number;
  tasks_outstanding?: number;
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-2.5">
      <Text className="mb-0.5 text-xs text-[#757575]">{label}</Text>
      <Text className="text-[15px] font-medium text-[#333333]">{value}</Text>
    </View>
  );
}

function formatDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const formatted = formatCleanDate(value);
  return formatted === 'N/A' ? undefined : formatted;
}

export function AgentFarmerProfileScreen({ route, navigation }: Props) {
  const { farmerId, name: routeName } = route.params;
  const currentUser = useAuthStore((s) => s.user);
  const [farmer, setFarmer] = useState<FarmerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [taskCompleted, setTaskCompleted] = useState(0);
  const [taskOutstanding, setTaskOutstanding] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingVerifications, setPendingVerifications] = useState<PendingFarmerVerificationView[]>(
    []
  );
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [reviewingPhoto, setReviewingPhoto] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
    setFarmer(null);
    setLoading(true);
    setLoadError(null);
    setTaskCompleted(0);
    setTaskOutstanding(0);
  }, [farmerId]);

  const loadPending = useCallback(async () => {
    const all = await listPendingFarmerVerifications();
    setPendingVerifications(all.filter((p) => p.farmerId === farmerId));
  }, [farmerId]);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [farmerResult, tasksResult] = await Promise.all([
        getAgentFarmerById(farmerId),
        getAdminFarmerTasks({ farmer_id: farmerId }).catch(() => null),
      ]);
      setFarmer(farmerResult.farmer as FarmerDetail);

      if (tasksResult) {
        const tasks = tasksResult.tasks ?? [];
        const completed = tasks.filter((t: { status?: string }) =>
          ['approved', 'completed'].includes(t.status ?? '')
        ).length;
        const outstanding = tasks.filter(
          (t: { status?: string }) => !['approved', 'completed'].includes(t.status ?? '')
        ).length;
        setTaskCompleted(completed);
        setTaskOutstanding(outstanding);
      } else {
        setTaskCompleted(0);
        setTaskOutstanding(0);
      }
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      if (!hasLoadedRef.current) {
        setFarmer(null);
      }
      setLoadError(extractApiError(err, 'Could not load farmer profile'));
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        // Paint profile ASAP — do not wait on outbox sync before fetching.
        await Promise.all([load(), loadPending()]);
        if (cancelled) return;
        await syncAllPendingFarmerVerifications();
        if (cancelled) return;
        await Promise.all([load(), loadPending()]);
      })();
      return () => {
        cancelled = true;
      };
    }, [load, loadPending])
  );

  const statusInfo = formatFarmerStatus(farmer?.status);
  const canVerify = farmer?.status === 'pending_field_verification';
  const isOwnRegistration =
    farmer?.registered_agent_user_id && currentUser?.userId === farmer.registered_agent_user_id;

  const centreLocation = [
    farmer?.centre_location_level_1 ?? farmer?.district,
    farmer?.centre_location_level_2 ?? farmer?.sub_county,
  ]
    .filter(Boolean)
    .join(', ');

  const handlePhotoReview = async (decision: 'approved' | 'rejected') => {
    if (!farmer || reviewingPhoto) return;
    setReviewingPhoto(true);
    try {
      await reviewFarmerProfilePhoto(farmerId, decision);
      Alert.alert(
        decision === 'approved' ? 'Photo approved' : 'Photo not approved',
        decision === 'approved'
          ? `${farmer.name}'s profile photo has been updated.`
          : `${farmer.name}'s current photo is unchanged. They can submit another photo.`
      );
      await load();
    } catch (err: unknown) {
      Alert.alert('Could not review photo', extractApiError(err, 'Please try again.'));
    } finally {
      setReviewingPhoto(false);
    }
  };

  const handleVerifySubmit = async (
    verificationStatus: 'verified' | 'rejected',
    notes?: string
  ) => {
    if (!farmer) return;
    setVerifying(true);
    try {
      const result = await submitFarmerVerificationWithOutbox({
        farmerId,
        farmerName: farmer.name,
        verificationStatus,
        // Authoritative pin: farmers.status (must still be pending_field_verification)
        expectedStatus: farmer.status,
        notes,
      });
      await loadPending();

      if (result.mode === 'online') {
        setVerifyModalOpen(false);
        Alert.alert(
          verificationStatus === 'verified' ? 'Farmer verified' : 'Farmer rejected',
          verificationStatus === 'verified'
            ? 'Farmer verified successfully!'
            : 'Farmer marked as rejected.'
        );
        await load();
        navigation.goBack();
        return;
      }

      if (result.mode === 'offline') {
        setVerifyModalOpen(false);
        Alert.alert(
          'Saved offline',
          'Verification queued on this device. It will sync when you are back online.'
        );
        return;
      }

      Alert.alert('Needs your review', result.error);
    } catch (err) {
      Alert.alert('Error', extractApiError(err, 'Verification failed'));
    } finally {
      setVerifying(false);
    }
  };

  const handlePush = async (item: PendingFarmerVerificationView) => {
    setPushingId(item.id);
    try {
      const result = await pushPendingFarmerVerification(item.id);
      await loadPending();
      if (result.success) {
        await load();
        Alert.alert(
          'Synced',
          `${item.farmerName} ${item.verificationStatus === 'verified' ? 'verified' : 'rejected'}.`
        );
        navigation.goBack();
      } else if (result.needsReview) {
        Alert.alert('Needs your review', result.error ?? 'Conflict detected');
      } else {
        Alert.alert('Push failed', result.error ?? 'Could not sync verification');
      }
    } finally {
      setPushingId(null);
    }
  };

  if (loading && !farmer) {
    return (
      <View className="flex-1 bg-[#F5F5F5]">
        <View className="items-center bg-[#1A4D3E] px-4 pb-6 pt-4">
          <Text className="mt-4 text-2xl font-bold text-white">{routeName}</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1A4D3E" />
        </View>
      </View>
    );
  }

  if (!farmer) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <View className="mb-4 w-full max-w-sm rounded-lg border border-[#D32F2F] bg-[#FFEBEE] px-4 py-3">
          <Text className="text-center text-sm leading-5 text-[#D32F2F]">
            {loadError ?? 'Could not load farmer profile.'}
          </Text>
        </View>
        <Button variant="outline" className="mt-4" onPress={() => navigation.goBack()}>
          <Text>Back to farmers</Text>
        </Button>
        <Button variant="ghost" className="mt-2" onPress={load}>
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }

  return (
    <>
      <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="pb-8">
        <View className="items-center bg-[#1A4D3E] px-4 pb-6 pt-4">
          <View className="items-center">
            <FarmerProfilePhoto
              name={farmer.name || routeName}
              pictureUrl={farmer.picture_url}
              size="hero"
            />
            <Text className="mt-3 text-2xl font-bold text-white">{farmer.name || routeName}</Text>
            <View className="mt-3">
              <FarmerStatusChip status={farmer.status} />
            </View>
            <Text className="mt-2 text-center text-xs text-[#C8E6D9]">{statusInfo.description}</Text>
            {!isUsableFarmerPhotoUrl(farmer.picture_url) ? (
              <View className="mt-4 w-full max-w-sm rounded-md border border-[#D32F2F] bg-[#FFEBEE] px-3 py-3">
                <Text className="text-center text-xs leading-5 text-[#D32F2F]">
                  No valid verification photo on file. Farmers must have a real camera/gallery photo — not an avatar.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="p-4">
          {farmer.pending_picture_url ? (
            <View className="mb-3 rounded-lg border border-[#FBBF24] bg-[#FFF8E1] p-3.5">
              <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
                New profile photo
              </Text>
              <Text className="mb-3 text-sm text-[#333333]">
                {farmer.name} submitted this photo. Approve it to replace their current profile picture.
              </Text>
              <View style={styles.pendingPhotoWrap}>
                <Image source={{ uri: farmer.pending_picture_url }} style={styles.pendingPhoto} />
              </View>
              <View style={styles.reviewRow}>
                <View style={styles.reviewSlot}>
                  <Pressable
                    onPress={() => void handlePhotoReview('rejected')}
                    disabled={reviewingPhoto}
                    style={[styles.rejectBtn, reviewingPhoto && styles.reviewDisabled]}
                  >
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </Pressable>
                </View>
                <View style={styles.reviewSlot}>
                  <Pressable
                    onPress={() => void handlePhotoReview('approved')}
                    disabled={reviewingPhoto}
                    style={[styles.approveBtn, reviewingPhoto && styles.reviewDisabled]}
                  >
                    {reviewingPhoto ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.approveBtnText}>Approved</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {pendingVerifications.length > 0 ? (
            <View className="mb-3">
              <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">
                Queued verification
              </Text>
              {pendingVerifications.map((item) => (
                <OutboxFarmerVerificationCard
                  key={item.id}
                  item={item}
                  pushing={pushingId === item.id}
                  onPush={() => handlePush(item)}
                  onDismiss={() => dismissFarmerVerificationOutbox(item.id).then(loadPending)}
                />
              ))}
            </View>
          ) : null}

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Basic information</Text>
            <DetailRow label="National ID" value="On file (encrypted)" />
            <DetailRow label="Gender" value={farmer.gender} />
            <DetailRow label="Phone" value={farmer.phone_number} />
            <DetailRow label="Registered" value={formatDate(farmer.created_at)} />
            <DetailRow label="Membership #" value={farmer.key} />
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Location</Text>
            <DetailRow label="Country" value={farmer.country} />
            <DetailRow label="County" value={farmer.district} />
            <DetailRow label="Sub-County" value={farmer.sub_county} />
            <DetailRow label="Ward" value={farmer.parish} />
            <DetailRow label="Village" value={farmer.village} />
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Aggregation centre</Text>
            <DetailRow label="Centre" value={farmer.aggregation_center ?? 'Not assigned'} />
            <DetailRow label="Contact" value={farmer.aggregation_centre_contact} />
            <DetailRow label="Location" value={centreLocation || undefined} />
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Membership</Text>
            <DetailRow label="Cooperative" value={farmer.membership_group_name} />
            <DetailRow label="Member since" value={formatDate(farmer.created_at)} />
            <DetailRow label="Status" value={farmer.membership_type} />
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Field agent</Text>
            <DetailRow
              label="Assigned FA"
              value={isOwnRegistration ? `You (${currentUser?.name ?? 'Agent'})` : farmer.registered_agent_name ?? 'Not assigned'}
            />
            <DetailRow label="Agent phone" value={farmer.registered_agent_phone} />
            <DetailRow label="Assigned" value={formatDate(farmer.created_at)} />
            <DetailRow
              label="Verification"
              value={farmer.status === 'verified' ? 'Verified' : 'Not yet verified'}
            />
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Land information</Text>
            <DetailRow label="Size of land" value={farmer.size_of_land ? `${farmer.size_of_land} acres` : undefined} />
            <DetailRow label="Occupation" value={farmer.occupation} />
          </View>

          {(farmer.projects?.length ?? 0) > 0 ? (
            <View className="mb-3 rounded-lg bg-white p-3.5">
              <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Projects involved</Text>
              {farmer.projects?.map((p) => {
                const enrolled = farmer.status === 'verified';
                const ProjectIcon = enrolled ? SquareCheck : Square;
                return (
                  <View key={p.project_name} className="mb-1 flex-row items-center gap-1.5">
                    <ProjectIcon size={16} color="#333333" />
                    <Text className="text-[15px] font-semibold text-[#333333]">
                      {p.project_name} · {p.status}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Tasks completed</Text>
            <View className="flex-row items-center gap-1.5">
              <CircleCheck size={16} color="#333333" />
              <Text className="text-[15px] font-semibold text-[#333333]">{taskCompleted} task(s) completed</Text>
            </View>
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Tasks outstanding</Text>
            <View className="flex-row items-center gap-1.5">
              <Hourglass size={16} color="#333333" />
              <Text className="text-[15px] font-semibold text-[#333333]">{taskOutstanding} task(s) pending completion</Text>
            </View>
          </View>

          <View className="mb-3 rounded-lg bg-white p-3.5">
            <Text className="mb-2.5 text-sm font-bold uppercase tracking-wide text-[#1A4D3E]">Activity record</Text>
            <Text className="text-sm text-[#333333]">• Registered: {formatDate(farmer.created_at) ?? '—'}</Text>
            <Text className="text-sm text-[#333333]">
              • Verification: {farmer.status === 'verified' ? 'Verified' : formatFarmerStatus(farmer.status).label}
            </Text>
          </View>

          {farmer.status === 'pending_review' ? (
            <View className="mb-3 rounded-lg border border-[#FCD34D] bg-[#FFF8E1] p-3">
              <Text className="text-sm text-[#757575]">
                Awaiting PM review. Once approved, status becomes Pending Field Verification and you can verify in person.
              </Text>
            </View>
          ) : null}

          {canVerify && pendingVerifications.length === 0 ? (
            <Button className="h-12 bg-[#1A4D3E]" onPress={() => setVerifyModalOpen(true)}>
              <Text className="text-white">Verify Farmer</Text>
            </Button>
          ) : null}
        </View>
      </ScrollView>

      <VerifyFarmerModal
        visible={verifyModalOpen}
        farmerName={farmer.name}
        farmerPhone={farmer.phone_number}
        locationLabel={centreLocation || `${farmer.district}, ${farmer.sub_county}`}
        loading={verifying}
        onClose={() => setVerifyModalOpen(false)}
        onSubmit={handleVerifySubmit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pendingPhotoWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  pendingPhoto: {
    width: 160,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 120,
    height: 48,
    marginHorizontal: 4,
  },
  rejectBtn: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D32F2F',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  rejectBtnText: {
    fontWeight: '700',
    color: '#D32F2F',
    fontSize: 15,
  },
  approveBtn: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#1A4D3E',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({ web: { cursor: 'pointer' as const } }),
  },
  approveBtnText: {
    fontWeight: '700',
    color: '#fff',
    fontSize: 15,
  },
  reviewDisabled: {
    opacity: 0.65,
  },
});

