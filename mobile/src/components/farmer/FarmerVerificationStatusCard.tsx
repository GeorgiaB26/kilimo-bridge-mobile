import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { FarmerStatusChip } from '../agent/FarmerStatusChip';
import { formatFarmerStatus } from '../../utils/farmerStatus';

const VERIFICATION_STEPS = [
  { key: 'pending_review', label: 'PM review' },
  { key: 'pending_field_verification', label: 'Field agent visit' },
  { key: 'verified', label: 'Verified' },
] as const;

function stepIndex(status?: string | null): number {
  const key = (status ?? '').toLowerCase().replace(/\s+/g, '_');
  if (key === 'verified') return 2;
  if (key === 'pending_field_verification') return 1;
  if (key === 'pending_review') return 0;
  if (key === 'rejected') return -1;
  return 0;
}

interface FarmerVerificationStatusCardProps {
  status?: string | null;
  compact?: boolean;
}

/**
 * Farmer portal — shows registration / verification progress (pending vs verified).
 */
export function FarmerVerificationStatusCard({ status, compact = false }: FarmerVerificationStatusCardProps) {
  const info = formatFarmerStatus(status);
  const currentStep = stepIndex(status);
  const isRejected = (status ?? '').toLowerCase().replace(/\s+/g, '_') === 'rejected';
  const isVerified = (status ?? '').toLowerCase().replace(/\s+/g, '_') === 'verified';

  return (
    <View className={`rounded-xl bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold uppercase tracking-wide text-[#757575]">
          Registration status
        </Text>
        <FarmerStatusChip status={status} />
      </View>
      <Text className={`mt-2 text-sm leading-5 text-[#333333] ${compact ? '' : 'text-[15px]'}`}>
        {info.description}
      </Text>

      {isRejected ? (
        <View className="mt-3 flex-row items-start gap-2 rounded-lg bg-[#FFEBEE] p-3">
          <Ionicons name="alert-circle" size={18} color="#D32F2F" />
          <Text className="flex-1 text-xs leading-5 text-[#D32F2F]">
            Your registration was not approved. Use &quot;Need help?&quot; on your profile to contact your field agent.
          </Text>
        </View>
      ) : null}

      {!isRejected && !compact ? (
        <View className="mt-4">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#757575]">
            Verification progress
          </Text>
          {VERIFICATION_STEPS.map((step, index) => {
            const done = isVerified ? true : index < currentStep;
            const active = !isVerified && index === currentStep;
            return (
              <View key={step.key} className="mb-2 flex-row items-center gap-2">
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full ${
                    done ? 'bg-[#2E7D5E]' : active ? 'bg-[#FBBF24]' : 'bg-[#E0E0E0]'
                  }`}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  ) : (
                    <Text className="text-[11px] font-bold text-[#333333]">{index + 1}</Text>
                  )}
                </View>
                <Text
                  className={`text-sm ${active ? 'font-semibold text-[#1A4D3E]' : 'text-[#757575]'}`}
                >
                  {step.label}
                  {active ? ' — in progress' : done ? ' — complete' : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {!isVerified && !isRejected && !compact ? (
        <Text className="mt-3 text-xs text-[#757575]">
          You can use projects and payments once your field agent verifies your profile.
        </Text>
      ) : null}
    </View>
  );
}
