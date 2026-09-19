import React from 'react';
import { View } from 'react-native';
import { PickerField } from './PickerField';

export type FarmerListGroupOption = { id: string; name: string };
export type FarmerListProjectOption = { id: string; name: string };

const ALL = 'All';

type Props = {
  groups: FarmerListGroupOption[];
  projects: FarmerListProjectOption[];
  membershipGroupId: string;
  programProjectId: string;
  onChangeGroup: (id: string) => void;
  onChangeProject: (id: string) => void;
};

export function FarmerListFilterFields({
  groups,
  projects,
  membershipGroupId,
  programProjectId,
  onChangeGroup,
  onChangeProject,
}: Props) {
  return (
    <View>
      <PickerField
        label="Cooperative"
        value={membershipGroupId}
        options={[{ label: ALL, value: '' }, ...groups.map((g) => ({ label: g.name, value: g.id }))]}
        onSelect={onChangeGroup}
        searchable
        placeholder="All cooperatives"
      />
      <PickerField
        label="Project"
        value={programProjectId}
        options={[{ label: ALL, value: '' }, ...projects.map((p) => ({ label: p.name, value: p.id }))]}
        onSelect={onChangeProject}
        searchable
        placeholder="All projects"
      />
    </View>
  );
}
