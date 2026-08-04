import React from 'react';
import { View, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/text';
import { useCurrency } from '../../context/CurrencyContext';
import { KBProgressBar } from '../../components/ui/KBProgressBar';
import { KBStatusChip } from '../../components/ui/KBStatusChip';
import { FarmerProjectTasksSection } from '../../components/farmer/FarmerProjectTasksSection';
import { formatDueDate, formatProjectStatus, formatProjectDate } from '../../utils/greeting';
import { PROJECT_DESCRIPTIONS } from '../../types/farmerProject';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FarmerProjectsStackParamList, 'ProjectDetail'>;

export function FarmerProjectDetailScreen({ route }: Props) {
  const { project, programProjectId } = route.params;
  const { formatAmount } = useCurrency();
  const statusInfo = formatProjectStatus(project.status);
  const isComplete = project.status === 'Completed';
  const description =
    PROJECT_DESCRIPTIONS[project.project_name] ??
    'A Kilimo Bridge cooperative project. Complete the assigned work to receive your payment via M-Pesa.';

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4 pb-10">
      <View className="mb-4 items-center rounded-2xl bg-white p-6">
        <View className="mb-3 h-[72px] w-[72px] items-center justify-center rounded-full bg-[#E8F5F0]">
          <Ionicons name="leaf" size={36} color="#1A4D3E" />
        </View>
        <Text className="mb-3 text-center text-2xl font-bold text-[#1A4D3E]">{project.project_name}</Text>
        <KBStatusChip label={statusInfo.label} variant={statusInfo.variant} />
      </View>

      <View className="mb-3 rounded-xl bg-white p-[18px]">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-[#757575]">About this project</Text>
        <Text className="text-[15px] leading-[22px] text-[#333333]">{description}</Text>
      </View>

      <View className="mb-3 rounded-xl bg-white p-[18px]">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-[#757575]">Schedule</Text>
        <Text className="text-[15px] leading-[22px] text-[#333333]">
          Start: {formatProjectDate(project.start_date)}
          {' · '}
          End: {formatProjectDate(project.due_date)}
        </Text>
      </View>

      <View className="mb-3 rounded-xl bg-white p-[18px]">
        <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-[#757575]">Payment</Text>
        <Text className="text-[32px] font-extrabold leading-10 text-[#D4AF6A]">{formatAmount(project.payment_amount)}</Text>
        {project.payment_status ? (
          <Text className="mt-2.5 text-sm leading-[22px] text-[#757575]">Payment status: {project.payment_status}</Text>
        ) : null}
      </View>

      {!isComplete ? (
        <View className="mb-3 rounded-xl bg-white p-[18px]">
          <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-[#757575]">Your progress</Text>
          <KBProgressBar
            progress={project.completion_percentage}
            label={`${project.completion_percentage}% complete`}
            rightLabel={project.due_date ? `Due ${formatDueDate(project.due_date)}` : undefined}
            stacked
          />
        </View>
      ) : null}

      <View className="mb-3 rounded-xl bg-white p-[18px]">
        <FarmerProjectTasksSection programProjectId={programProjectId} />
      </View>
    </ScrollView>
  );
}
