import React from 'react';
import { ScrollView } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { Text } from '@/components/ui/text';
import { FarmerProjectTasksSection } from '../../components/farmer/FarmerProjectTasksSection';
import type { FarmerProjectsStackParamList } from '../../navigation/types';
import { useTabScreenContentContainerStyle } from '../../navigation/FloatingTabBar';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyProjectDetail'>;

export function FarmerHierarchyProjectDetailScreen({ route }: { route: Route }) {
  const { projectId, projectName } = route.params;
  const scrollContentStyle = useTabScreenContentContainerStyle();

  return (
    <ScrollView className="flex-1 bg-[#F5F5F5]" contentContainerClassName="p-4" contentContainerStyle={scrollContentStyle}>
      <Text className="text-[22px] font-bold text-[#1A4D3E]">{projectName}</Text>
      <Text className="my-2 mb-2 text-sm leading-5 text-[#757575]">
        Complete each task in order and submit photo evidence for payment.
      </Text>
      <FarmerProjectTasksSection programProjectId={projectId} compact />
    </ScrollView>
  );
}
