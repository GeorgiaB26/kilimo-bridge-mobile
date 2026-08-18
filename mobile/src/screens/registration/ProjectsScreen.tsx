import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { fetchProjectHierarchy } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Projects'>;

type HierarchyRow = {
  id: string;
  name: string;
  description?: string | null;
  sector_id?: string;
  program_id?: string;
};

export function ProjectsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [sectors, setSectors] = useState<HierarchyRow[]>([]);
  const [programs, setPrograms] = useState<HierarchyRow[]>([]);
  const [projects, setProjects] = useState<HierarchyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProjectHierarchy()
      .then((data) => {
        if (cancelled) return;
        setSectors(data.sectors ?? []);
        setPrograms(data.programs ?? []);
        setProjects(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load project hierarchy. You can skip this step.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const programOptions = useMemo(() => {
    if (!formData.projectEnrolmentSectorId) return [];
    return programs.filter((p) => p.sector_id === formData.projectEnrolmentSectorId);
  }, [programs, formData.projectEnrolmentSectorId]);

  const projectOptions = useMemo(() => {
    if (!formData.projectEnrolmentProgramId) return [];
    return projects.filter((p) => p.program_id === formData.projectEnrolmentProgramId);
  }, [projects, formData.projectEnrolmentProgramId]);

  const selectedProject = projectOptions.find((p) => p.id === formData.projectEnrolmentProjectId);

  const sectorNames = sectors.map((s) => s.name);
  const programNames = programOptions.map((p) => p.name);
  const projectNames = projectOptions.map((p) => p.name);

  const handleSector = (name: string) => {
    const match = sectors.find((s) => s.name === name);
    updateForm({
      projectEnrolmentSectorId: match?.id ?? '',
      projectEnrolmentProgramId: '',
      projectEnrolmentProjectId: '',
      skipProjectEnrolment: false,
    });
  };

  const handleProgram = (name: string) => {
    const match = programOptions.find((p) => p.name === name);
    updateForm({
      projectEnrolmentProgramId: match?.id ?? '',
      projectEnrolmentProjectId: '',
      skipProjectEnrolment: false,
    });
  };

  const handleProject = (name: string) => {
    const match = projectOptions.find((p) => p.name === name);
    updateForm({
      projectEnrolmentProjectId: match?.id ?? '',
      skipProjectEnrolment: false,
    });
  };

  const skip = () => {
    updateForm({
      skipProjectEnrolment: true,
      projectEnrolmentSectorId: '',
      projectEnrolmentProgramId: '',
      projectEnrolmentProjectId: '',
    });
    navigation.navigate('Photo');
  };

  return (
    <View className="flex-1">
      <ScreenHeader title="Project enrolment" subtitle="Optional — link to a program project" />
      {loading ? (
        <ActivityIndicator color="#1A4D3E" style={{ marginVertical: 24 }} />
      ) : (
        <>
          {error ? <Text className="mb-3 text-sm text-[#D32F2F]">{error}</Text> : null}
          <PickerField
            label="Sector"
            value={sectors.find((s) => s.id === formData.projectEnrolmentSectorId)?.name ?? ''}
            options={sectorNames}
            onSelect={handleSector}
            placeholder={sectors.length ? 'Select sector' : 'No sectors available'}
          />
          <PickerField
            label="Program / sub-sector"
            value={programOptions.find((p) => p.id === formData.projectEnrolmentProgramId)?.name ?? ''}
            options={programNames}
            onSelect={handleProgram}
            placeholder={
              formData.projectEnrolmentSectorId ? 'Select program' : 'Select sector first'
            }
          />
          <PickerField
            label="Project"
            value={selectedProject?.name ?? ''}
            options={projectNames}
            onSelect={handleProject}
            placeholder={
              formData.projectEnrolmentProgramId ? 'Select project' : 'Select program first'
            }
          />
          {selectedProject?.description ? (
            <View className="mb-4 rounded-lg border border-[#E0E0E0] bg-[#F9F9F9] p-3">
              <Text className="text-xs font-semibold text-[#757575]">Project details</Text>
              <Text className="mt-1 text-sm text-[#333333]">{selectedProject.description}</Text>
            </View>
          ) : null}
        </>
      )}
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button variant="outline" className="h-12 flex-1" onPress={skip}>
          <Text>Skip</Text>
        </Button>
        <Button className="h-12 flex-1 bg-[#1A4D3E]" onPress={() => navigation.navigate('Photo')}>
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
