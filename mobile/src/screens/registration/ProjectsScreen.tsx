import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { PickerField } from '../../components/PickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PROJECTS } from '../../constants';
import { fetchReferenceData } from '../../api/client';
import { useRegistrationStore } from '../../store/registrationStore';
import type { RegistrationStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RegistrationStackParamList, 'Projects'>;

export function ProjectsScreen({ navigation }: Props) {
  const { formData, updateForm } = useRegistrationStore();
  const [projects, setProjects] = useState<string[]>([...PROJECTS]);

  useEffect(() => {
    fetchReferenceData()
      .then((data) => setProjects(data.projects))
      .catch(() => setProjects([...PROJECTS]));
  }, []);

  return (
    <View>
      <ScreenHeader title="Projects" subtitle="Assign projects (optional)" />
      <PickerField
        label="Project 1"
        value={formData.project1 ?? ''}
        options={['', ...projects]}
        onSelect={(project1) => updateForm({ project1: project1 || undefined })}
        placeholder="None"
      />
      <PickerField
        label="Project 2"
        value={formData.project2 ?? ''}
        options={['', ...projects]}
        onSelect={(project2) => updateForm({ project2: project2 || undefined })}
        placeholder="None"
      />
      <PickerField
        label="Project 3"
        value={formData.project3 ?? ''}
        options={['', ...projects]}
        onSelect={(project3) => updateForm({ project3: project3 || undefined })}
        placeholder="None"
      />
      <View className="mt-2 flex-row gap-3">
        <Button variant="outline" className="h-12 flex-1" onPress={() => navigation.goBack()}>
          <Text>Back</Text>
        </Button>
        <Button className="h-12 flex-1 bg-[#1A4D3E]" onPress={() => navigation.navigate('Photo')}>
          <Text className="text-white">Next</Text>
        </Button>
      </View>
    </View>
  );
}
