import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PickerField } from '../../components/PickerField';
import { Button } from '../../components/Button';
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
    <View style={styles.container}>
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
      <View style={styles.row}>
        <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.half} />
        <Button title="Next" onPress={() => navigation.navigate('Photo')} style={styles.half} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
});
