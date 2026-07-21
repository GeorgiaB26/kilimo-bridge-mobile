import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { COLORS } from '../../constants';
import { FarmerProjectTasksSection } from '../../components/farmer/FarmerProjectTasksSection';
import type { FarmerProjectsStackParamList } from '../../navigation/types';

type Route = RouteProp<FarmerProjectsStackParamList, 'HierarchyProjectDetail'>;

export function FarmerHierarchyProjectDetailScreen({ route }: { route: Route }) {
  const { projectId, projectName } = route.params;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{projectName}</Text>
      <Text style={styles.subtitle}>Complete each task in order and submit photo evidence for payment.</Text>
      <FarmerProjectTasksSection programProjectId={projectId} compact />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.muted, marginVertical: 8, lineHeight: 20, marginBottom: 8 },
});
