import React, { useState, useCallback } from 'react';
import {
  View, ScrollView, RefreshControl, Alert, Pressable, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Menu, Button as PaperButton } from 'react-native-paper';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { AdminFormModal } from '../../components/admin/AdminFormModal';
import { KBCard } from '../../components/ui/KBCard';
import { extractApiError } from '../../utils/feedback';
import { formatCleanDate } from '../../utils/greeting';
import {
  DISPLAY_DATE_FORMAT,
  formatAgentTaskDueInput,
  parseAgentTaskDueDateInput,
} from '../../utils/agentTaskDate';
import {
  getAdminSectors, createAdminSector, updateAdminSector, deleteAdminSector,
  getAdminPrograms, createAdminProgram, updateAdminProgram, deleteAdminProgram,
  getAdminProjects, createAdminProject, updateAdminProject, deleteAdminProject,
  getAdminProjectTasks, createAdminProjectTask, updateAdminProjectTask, deleteAdminProjectTask,
  reorderAdminProjectTask, getAdminProjectFarmers, assignAdminProjectFarmers, removeAdminProjectFarmer,
  searchFarmers,
} from '../../api/client';

type ManageTab = 'sectors' | 'programs' | 'projects' | 'tasks' | 'assign';

const TABS: { key: ManageTab; label: string }[] = [
  { key: 'sectors', label: 'Sectors' },
  { key: 'programs', label: 'Programs' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'assign', label: 'Assign' },
];

export function AdminManageScreen() {
  const [tab, setTab] = useState<ManageTab>('sectors');
  const [refreshing, setRefreshing] = useState(false);
  const [sectors, setSectors] = useState<Array<{ id: string; name: string; description?: string; created_at?: string }>>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; sector_name?: string; budget_kes?: number }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; program_name?: string; budget_kes?: number; start_date?: string; end_date?: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; name: string; task_order: number; payment_value_kes: number; due_date?: string; description?: string }>>([]);
  const [farmers, setFarmers] = useState<Array<{ farmer_id: string; name: string; phone_number: string; assigned_date?: string; assigned_tasks?: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [modal, setModal] = useState<{ type: ManageTab; item?: Record<string, unknown> } | null>(null);
  const [farmerSearch, setFarmerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ farmer_id: string; name: string; phone_number: string }>>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<{ farmer_id: string; name: string } | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState('');
  const [assignTaskIds, setAssignTaskIds] = useState<string[]>([]);
  const [assignProjectTasks, setAssignProjectTasks] = useState<Array<{ id: string; name: string; task_order: number }>>([]);
  const [assignProjectMenuOpen, setAssignProjectMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, p, pr] = await Promise.all([
        getAdminSectors(),
        getAdminPrograms(),
        getAdminProjects(),
      ]);
      setSectors(s.sectors ?? []);
      setPrograms(p.programs ?? []);
      const projectList = pr.projects ?? [];
      setProjects(projectList);
      const pid = selectedProjectId || projectList[0]?.id || '';
      if (!selectedProjectId && pid) setSelectedProjectId(pid);
      if (pid) {
        const [t, f] = await Promise.all([
          getAdminProjectTasks(pid),
          getAdminProjectFarmers(pid),
        ]);
        setTasks((t.tasks ?? []).sort((a: { task_order: number }, b: { task_order: number }) => a.task_order - b.task_order));
        setFarmers(f.farmers ?? []);
      }
    } catch {
      // keep prior data
    }
  }, [selectedProjectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (label: string, onConfirm: () => Promise<void>) => {
    Alert.alert('Delete', `Delete ${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onConfirm().then(load).catch((e: unknown) => Alert.alert('Error', extractApiError(e, 'Delete failed'))) },
    ]);
  };

  const renderSectors = () => (
    <>
      <Button className="mb-4 h-11 bg-[#1A4D3E]" onPress={() => setModal({ type: 'sectors' })}>
        <Text className="text-white">+ New Sector</Text>
      </Button>
      {sectors.map((s) => (
        <KBCard key={s.id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{s.name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{s.created_at ? formatCleanDate(s.created_at) : '—'}</Text>
          <View className="mt-2 flex-row flex-wrap gap-1">
            <Button variant="ghost" size="sm" onPress={() => setModal({ type: 'sectors', item: s })}>
              <Text>Edit</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => confirmDelete(s.name, () => deleteAdminSector(s.id))}>
              <Text className="text-[#D32F2F]">Delete</Text>
            </Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const renderPrograms = () => (
    <>
      <Button className="mb-4 h-11 bg-[#1A4D3E]" onPress={() => setModal({ type: 'programs' })}>
        <Text className="text-white">+ New Program</Text>
      </Button>
      {programs.map((p) => (
        <KBCard key={p.id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{p.name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{p.sector_name} · KES {(p.budget_kes ?? 0).toLocaleString()}</Text>
          <View className="mt-2 flex-row flex-wrap gap-1">
            <Button variant="ghost" size="sm" onPress={() => setModal({ type: 'programs', item: p })}>
              <Text>Edit</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => confirmDelete(p.name, () => deleteAdminProgram(p.id))}>
              <Text className="text-[#D32F2F]">Delete</Text>
            </Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const renderProjects = () => (
    <>
      <Button className="mb-4 h-11 bg-[#1A4D3E]" onPress={() => setModal({ type: 'projects' })}>
        <Text className="text-white">+ New Project</Text>
      </Button>
      {projects.map((p) => (
        <KBCard key={p.id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{p.name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{p.program_name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">KES {(p.budget_kes ?? 0).toLocaleString()} · {p.start_date ? formatCleanDate(p.start_date) : '—'} → {p.end_date ? formatCleanDate(p.end_date) : '—'}</Text>
          <View className="mt-2 flex-row flex-wrap gap-1">
            <Button variant="ghost" size="sm" onPress={() => setModal({ type: 'projects', item: p })}>
              <Text>Edit</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => confirmDelete(p.name, () => deleteAdminProject(p.id))}>
              <Text className="text-[#D32F2F]">Delete</Text>
            </Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const projectName = projects.find((p) => p.id === selectedProjectId)?.name ?? 'Select project';

  const renderProjectFilter = () => (
    <Menu visible={projectMenuOpen} onDismiss={() => setProjectMenuOpen(false)} anchor={
      <PaperButton mode="outlined" onPress={() => setProjectMenuOpen(true)} style={{ marginBottom: 12, alignSelf: 'flex-start' }}>{projectName}</PaperButton>
    }>
      {projects.map((p) => (
        <Menu.Item key={p.id} title={p.name} onPress={() => { setSelectedProjectId(p.id); setProjectMenuOpen(false); }} />
      ))}
    </Menu>
  );

  const renderTasks = () => (
    <>
      {renderProjectFilter()}
      <Button
        className="mb-4 h-11 bg-[#1A4D3E]"
        onPress={() => setModal({ type: 'tasks' })}
        disabled={!selectedProjectId}
      >
        <Text className="text-white">+ New Task</Text>
      </Button>
      {tasks.map((t) => (
        <KBCard key={t.id} elevated={false}>
          <Text className="mb-1 text-xs font-bold text-[#1A4D3E]">Order {t.task_order}</Text>
          <Text className="text-[15px] font-semibold text-[#333333]">Task {t.task_order}: {t.name} — {t.payment_value_kes?.toLocaleString()} KES</Text>
          {t.description ? <Text className="mt-1 text-[13px] text-[#757575]">{t.description}</Text> : null}
          <Text className="mt-1 text-[13px] text-[#757575]">Due {t.due_date ? formatCleanDate(t.due_date) : '—'}</Text>
          <View className="mt-2 flex-row flex-wrap gap-1">
            <Button variant="ghost" size="sm" onPress={() => setModal({ type: 'tasks', item: t })}>
              <Text>Edit</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => reorderAdminProjectTask(t.id, 'up').then(load)}>
              <Text>↑ Move up</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => reorderAdminProjectTask(t.id, 'down').then(load)}>
              <Text>↓ Move down</Text>
            </Button>
            <Button variant="ghost" size="sm" onPress={() => confirmDelete(t.name, () => deleteAdminProjectTask(t.id))}>
              <Text className="text-[#D32F2F]">Delete</Text>
            </Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const doFarmerSearch = async () => {
    if (!farmerSearch.trim()) return;
    const data = await searchFarmers(farmerSearch.trim());
    setSearchResults(data.farmers ?? []);
  };

  const openAssignModal = async (farmer: { farmer_id: string; name: string }) => {
    setSelectedFarmer(farmer);
    const pid = selectedProjectId || projects[0]?.id || '';
    setAssignProjectId(pid);
    if (pid) {
      const data = await getAdminProjectTasks(pid);
      const list = (data.tasks ?? []) as Array<{ id: string; name: string; task_order: number }>;
      setAssignProjectTasks(list);
      setAssignTaskIds(list.map((t) => t.id));
    }
    setAssignModalOpen(true);
  };

  const renderAssign = () => (
    <>
      <Text className="mb-2 mt-2 text-[13px] font-bold text-[#757575]">Search farmer by name or phone</Text>
      <View className="mb-3 flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-lg border border-[#E0E0E0] bg-white p-2.5"
          value={farmerSearch}
          onChangeText={setFarmerSearch}
          placeholder="Name or phone"
        />
        <Button variant="outline" onPress={doFarmerSearch}>
          <Text>Search</Text>
        </Button>
      </View>
      {searchResults.map((f) => (
        <KBCard key={f.farmer_id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{f.name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{f.phone_number}</Text>
          <Button className="mb-0 mt-3 h-10 bg-[#1A4D3E]" onPress={() => openAssignModal(f)}>
            <Text className="text-white">Assign to Project</Text>
          </Button>
        </KBCard>
      ))}
      <Text className="mb-2 mt-2 text-[13px] font-bold text-[#757575]">Assigned farmers</Text>
      {renderProjectFilter()}
      {farmers.map((f) => (
        <KBCard key={f.farmer_id} elevated={false}>
          <Text className="text-base font-bold text-[#333333]">{f.name}</Text>
          <Text className="mt-1 text-[13px] text-[#757575]">{f.phone_number} · {f.assigned_date ? formatCleanDate(f.assigned_date) : '—'}</Text>
          {f.assigned_tasks ? <Text className="mt-1 text-[13px] text-[#757575]">Tasks: {f.assigned_tasks}</Text> : null}
          <Button variant="ghost" size="sm" onPress={() => confirmDelete(f.name, () => removeAdminProjectFarmer(selectedProjectId, f.farmer_id))}>
            <Text className="text-[#D32F2F]">Remove</Text>
          </Button>
        </KBCard>
      ))}
    </>
  );

  const modalConfig = (): { title: string; fields: Parameters<typeof AdminFormModal>[0]['fields']; onSubmit: (v: Record<string, string>) => Promise<void> } | null => {
    if (!modal) return null;
    const item = modal.item;
    if (modal.type === 'sectors') {
      return {
        title: item ? 'Edit Sector' : 'New Sector',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'description', label: 'Description', multiline: true },
        ],
        onSubmit: async (v) => {
          const body = { name: v.name, description: v.description, country: v.country };
          if (item) await updateAdminSector(String(item.id), body);
          else await createAdminSector(body);
          await load();
        },
      };
    }
    if (modal.type === 'programs') {
      return {
        title: item ? 'Edit Program' : 'Create Program',
        fields: [
          { key: 'name', label: 'Name', required: true },
          {
            key: 'sector_id',
            label: 'Sector',
            required: true,
            type: 'select',
            options: sectors.map((s) => ({ value: s.id, label: s.name })),
          },
          { key: 'budget_kes', label: 'Budget (KES)', keyboardType: 'numeric' },
          { key: 'description', label: 'Description', multiline: true },
        ],
        onSubmit: async (v) => {
          const body = {
            name: v.name,
            sector_id: v.sector_id,
            description: v.description,
            budget_kes: v.budget_kes ? Number(v.budget_kes) : undefined,
          };
          if (item) await updateAdminProgram(String(item.id), body);
          else await createAdminProgram(body);
          await load();
        },
      };
    }
    if (modal.type === 'projects') {
      return {
        title: item ? 'Edit Project' : 'Create Project',
        fields: [
          { key: 'name', label: 'Name', required: true },
          {
            key: 'program_id',
            label: 'Program',
            required: true,
            type: 'select',
            options: programs.map((p) => ({ value: p.id, label: p.name })),
          },
          { key: 'budget_kes', label: 'Budget (KES)', required: true, keyboardType: 'numeric' },
          { key: 'start_date', label: `Start Date (${DISPLAY_DATE_FORMAT})` },
          { key: 'end_date', label: `End Date (${DISPLAY_DATE_FORMAT})` },
        ],
        onSubmit: async (v) => {
          const startIso = v.start_date?.trim()
            ? parseAgentTaskDueDateInput(v.start_date)
            : null;
          const endIso = v.end_date?.trim() ? parseAgentTaskDueDateInput(v.end_date) : null;
          if (v.start_date?.trim() && !startIso) {
            throw new Error(`Start date must be ${DISPLAY_DATE_FORMAT}`);
          }
          if (v.end_date?.trim() && !endIso) {
            throw new Error(`End date must be ${DISPLAY_DATE_FORMAT}`);
          }
          const body = {
            ...v,
            budget_kes: Number(v.budget_kes),
            start_date: startIso ?? undefined,
            end_date: endIso ?? undefined,
          };
          if (item) await updateAdminProject(String(item.id), body);
          else await createAdminProject(body);
          await load();
        },
      };
    }
    if (modal.type === 'tasks') {
      return {
        title: item ? 'Edit Task' : 'New Task',
        fields: [
          { key: 'name', label: 'Name', required: true, placeholder: 'Farmer Training' },
          { key: 'task_order', label: 'Order (1-5)', required: true, keyboardType: 'numeric' },
          { key: 'payment_value_kes', label: 'Payment (KES)', required: true, keyboardType: 'numeric' },
          { key: 'description', label: 'Description', multiline: true },
          { key: 'due_date', label: `Due Date (${DISPLAY_DATE_FORMAT})` },
        ],
        onSubmit: async (v) => {
          const dueIso = v.due_date?.trim() ? parseAgentTaskDueDateInput(v.due_date) : null;
          if (v.due_date?.trim() && !dueIso) {
            throw new Error(`Due date must be ${DISPLAY_DATE_FORMAT}`);
          }
          const body = {
            name: v.name,
            task_order: Number(v.task_order),
            payment_value_kes: Number(v.payment_value_kes),
            description: v.description,
            due_date: dueIso ?? undefined,
          };
          if (item) await updateAdminProjectTask(String(item.id), body);
          else await createAdminProjectTask(selectedProjectId, body);
          await load();
        },
      };
    }
    return null;
  };

  const cfg = modalConfig();
  const initialModalValues = (() => {
    if (!modal?.item) {
      return modal?.type === 'programs' && sectors[0]
        ? { sector_id: sectors[0].id }
        : modal?.type === 'projects' && programs[0]
          ? { program_id: programs[0].id }
          : undefined;
    }
    const dateKeys = new Set(['start_date', 'end_date', 'due_date']);
    return Object.fromEntries(
      Object.entries(modal.item).map(([k, v]) => {
        if (v == null) return [k, ''];
        if (dateKeys.has(k)) return [k, formatAgentTaskDueInput(String(v))];
        return [k, String(v)];
      })
    );
  })();

  return (
    <View className="flex-1 bg-[#F5F5F5]">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-12 border-b border-[#E0E0E0] bg-white"
        contentContainerClassName="items-center px-2"
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            className={cn(
              'mx-0.5 px-3.5 py-3',
              tab === t.key && 'border-b-2 border-[#1A4D3E]'
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                tab === t.key ? 'text-[#1A4D3E]' : 'text-[#757575]'
              )}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerClassName="p-4 pb-10"
      >
        {tab === 'sectors' && renderSectors()}
        {tab === 'programs' && renderPrograms()}
        {tab === 'projects' && renderProjects()}
        {tab === 'tasks' && renderTasks()}
        {tab === 'assign' && renderAssign()}
      </ScrollView>
      {cfg ? (
        <AdminFormModal
          visible={!!modal}
          title={cfg.title}
          fields={cfg.fields}
          initialValues={initialModalValues}
          onClose={() => setModal(null)}
          onSubmit={cfg.onSubmit}
          submitLabel={modal?.item ? 'Update' : 'Create'}
        />
      ) : null}

      <Modal visible={assignModalOpen} transparent animationType="none">
        <View className="flex-1 justify-center bg-black/45 p-4">
          <View className="max-h-[85%] rounded-xl bg-white p-5">
            <Text className="mb-3 text-xl font-bold text-[#1A4D3E]">Assign {selectedFarmer?.name}</Text>
            <Menu visible={assignProjectMenuOpen} onDismiss={() => setAssignProjectMenuOpen(false)} anchor={
              <PaperButton mode="outlined" onPress={() => setAssignProjectMenuOpen(true)} style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
                {projects.find((p) => p.id === assignProjectId)?.name ?? 'Select project'}
              </PaperButton>
            }>
              {projects.map((p) => (
                <Menu.Item
                  key={p.id}
                  title={p.name}
                  onPress={async () => {
                    setAssignProjectId(p.id);
                    setAssignProjectMenuOpen(false);
                    const data = await getAdminProjectTasks(p.id);
                    const list = (data.tasks ?? []) as Array<{ id: string; name: string; task_order: number }>;
                    setAssignProjectTasks(list);
                    setAssignTaskIds(list.map((t) => t.id));
                  }}
                />
              ))}
            </Menu>
            <Text className="mb-2 mt-2 text-[13px] font-bold text-[#757575]">Select tasks to assign</Text>
            {assignProjectTasks.map((t) => {
              const checked = assignTaskIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setAssignTaskIds((ids) => checked ? ids.filter((id) => id !== t.id) : [...ids, t.id])}
                >
                  <KBCard elevated={false} style={checked ? { borderWidth: 2, borderColor: '#1A4D3E' } : undefined}>
                    <Text className="text-base font-bold text-[#333333]">{t.task_order}. {t.name}</Text>
                  </KBCard>
                </Pressable>
              );
            })}
            <Button
              className="mt-2 h-11 bg-[#1A4D3E]"
              disabled={!selectedFarmer || !assignProjectId || assignTaskIds.length === 0}
              onPress={async () => {
                if (!selectedFarmer || !assignProjectId) return;
                await assignAdminProjectFarmers(assignProjectId, [selectedFarmer.farmer_id], assignTaskIds);
                setAssignModalOpen(false);
                setSearchResults([]);
                setFarmerSearch('');
                await load();
                Alert.alert('Assigned', `${selectedFarmer.name} assigned to ${assignTaskIds.length} task(s).`);
              }}
            >
              <Text className="text-white">Confirm</Text>
            </Button>
            <Button variant="ghost" className="mt-1" onPress={() => setAssignModalOpen(false)}>
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      </Modal>
    </View>
  );
}
