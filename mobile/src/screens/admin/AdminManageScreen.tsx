import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Alert, Pressable, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Menu } from 'react-native-paper';
import { COLORS } from '../../constants';
import { AdminFormModal } from '../../components/admin/AdminFormModal';
import { KBCard } from '../../components/ui/KBCard';
import { extractApiError } from '../../utils/feedback';
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
  const [tasks, setTasks] = useState<Array<{ id: string; name: string; task_order: number; payment_value_kes: number; due_date?: string }>>([]);
  const [farmers, setFarmers] = useState<Array<{ farmer_id: string; name: string; phone_number: string; assigned_date?: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [modal, setModal] = useState<{ type: ManageTab; item?: Record<string, unknown> } | null>(null);
  const [farmerSearch, setFarmerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ farmer_id: string; name: string; phone_number: string }>>([]);
  const [selectedFarmer, setSelectedFarmer] = useState<{ farmer_id: string; name: string } | null>(null);

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
      <Button mode="contained" buttonColor={COLORS.primary} onPress={() => setModal({ type: 'sectors' })} style={styles.newBtn}>
        + New Sector
      </Button>
      {sectors.map((s) => (
        <KBCard key={s.id} elevated={false}>
          <Text style={styles.rowTitle}>{s.name}</Text>
          <Text style={styles.meta}>{s.created_at?.slice(0, 10) ?? '—'}</Text>
          <View style={styles.actions}>
            <Button compact onPress={() => setModal({ type: 'sectors', item: s })}>Edit</Button>
            <Button compact textColor={COLORS.alert} onPress={() => confirmDelete(s.name, () => deleteAdminSector(s.id))}>Delete</Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const renderPrograms = () => (
    <>
      <Button mode="contained" buttonColor={COLORS.primary} onPress={() => setModal({ type: 'programs' })} style={styles.newBtn}>
        + New Program
      </Button>
      {programs.map((p) => (
        <KBCard key={p.id} elevated={false}>
          <Text style={styles.rowTitle}>{p.name}</Text>
          <Text style={styles.meta}>{p.sector_name} · KES {(p.budget_kes ?? 0).toLocaleString()}</Text>
          <View style={styles.actions}>
            <Button compact onPress={() => setModal({ type: 'programs', item: p })}>Edit</Button>
            <Button compact textColor={COLORS.alert} onPress={() => confirmDelete(p.name, () => deleteAdminProgram(p.id))}>Delete</Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const renderProjects = () => (
    <>
      <Button mode="contained" buttonColor={COLORS.primary} onPress={() => setModal({ type: 'projects' })} style={styles.newBtn}>
        + New Project
      </Button>
      {projects.map((p) => (
        <KBCard key={p.id} elevated={false}>
          <Text style={styles.rowTitle}>{p.name}</Text>
          <Text style={styles.meta}>{p.program_name}</Text>
          <Text style={styles.meta}>KES {(p.budget_kes ?? 0).toLocaleString()} · {p.start_date ?? '—'} → {p.end_date ?? '—'}</Text>
          <View style={styles.actions}>
            <Button compact onPress={() => setModal({ type: 'projects', item: p })}>Edit</Button>
            <Button compact textColor={COLORS.alert} onPress={() => confirmDelete(p.name, () => deleteAdminProject(p.id))}>Delete</Button>
          </View>
        </KBCard>
      ))}
    </>
  );

  const projectName = projects.find((p) => p.id === selectedProjectId)?.name ?? 'Select project';

  const renderProjectFilter = () => (
    <Menu visible={projectMenuOpen} onDismiss={() => setProjectMenuOpen(false)} anchor={
      <Button mode="outlined" onPress={() => setProjectMenuOpen(true)} style={styles.filterBtn}>{projectName}</Button>
    }>
      {projects.map((p) => (
        <Menu.Item key={p.id} title={p.name} onPress={() => { setSelectedProjectId(p.id); setProjectMenuOpen(false); }} />
      ))}
    </Menu>
  );

  const renderTasks = () => (
    <>
      {renderProjectFilter()}
      <Button mode="contained" buttonColor={COLORS.primary} onPress={() => setModal({ type: 'tasks' })} style={styles.newBtn} disabled={!selectedProjectId}>
        + New Task
      </Button>
      {tasks.map((t) => (
        <KBCard key={t.id} elevated={false}>
          <Text style={styles.preview}>Task {t.task_order}: {t.name} — {t.payment_value_kes?.toLocaleString()} KES</Text>
          <Text style={styles.meta}>Due {t.due_date ?? '—'}</Text>
          <View style={styles.actions}>
            <Button compact onPress={() => setModal({ type: 'tasks', item: t })}>Edit</Button>
            <Button compact onPress={() => reorderAdminProjectTask(t.id, 'up').then(load)}>↑</Button>
            <Button compact onPress={() => reorderAdminProjectTask(t.id, 'down').then(load)}>↓</Button>
            <Button compact textColor={COLORS.alert} onPress={() => confirmDelete(t.name, () => deleteAdminProjectTask(t.id))}>Delete</Button>
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

  const renderAssign = () => (
    <>
      {renderProjectFilter()}
      <Text style={styles.sectionLabel}>Search farmer by name or phone</Text>
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} value={farmerSearch} onChangeText={setFarmerSearch} placeholder="Name or phone" />
        <Button mode="outlined" onPress={doFarmerSearch}>Search</Button>
      </View>
      {searchResults.map((f) => (
        <Pressable key={f.farmer_id} onPress={() => setSelectedFarmer(f)}>
          <KBCard elevated={false} style={selectedFarmer?.farmer_id === f.farmer_id ? styles.selected : undefined}>
            <Text style={styles.rowTitle}>{f.name}</Text>
            <Text style={styles.meta}>{f.phone_number}</Text>
          </KBCard>
        </Pressable>
      ))}
      <Button
        mode="contained"
        buttonColor={COLORS.primary}
        style={styles.newBtn}
        disabled={!selectedFarmer || !selectedProjectId}
        onPress={async () => {
          if (!selectedFarmer || !selectedProjectId) return;
          await assignAdminProjectFarmers(selectedProjectId, [selectedFarmer.farmer_id]);
          setSelectedFarmer(null);
          setSearchResults([]);
          setFarmerSearch('');
          await load();
          Alert.alert('Assigned', `${selectedFarmer.name} assigned to project.`);
        }}
      >
        Assign
      </Button>
      <Text style={styles.sectionLabel}>Assigned farmers</Text>
      {farmers.map((f) => (
        <KBCard key={f.farmer_id} elevated={false}>
          <Text style={styles.rowTitle}>{f.name}</Text>
          <Text style={styles.meta}>{f.phone_number} · {f.assigned_date?.slice(0, 10) ?? '—'}</Text>
          <Button compact textColor={COLORS.alert} onPress={() => confirmDelete(f.name, () => removeAdminProjectFarmer(selectedProjectId, f.farmer_id))}>
            Remove
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
        title: item ? 'Edit Program' : 'New Program',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'sector_id', label: 'Sector ID (pick from list)', required: true, placeholder: sectors[0]?.id },
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
        title: item ? 'Edit Project' : 'New Project',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'program_id', label: 'Program ID', required: true, placeholder: programs[0]?.id },
          { key: 'budget_kes', label: 'Budget (KES)', required: true, keyboardType: 'numeric' },
          { key: 'start_date', label: 'Start Date (YYYY-MM-DD)' },
          { key: 'end_date', label: 'Due Date (YYYY-MM-DD)' },
        ],
        onSubmit: async (v) => {
          const body = { ...v, budget_kes: Number(v.budget_kes) };
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
          { key: 'due_date', label: 'Due Date (YYYY-MM-DD)' },
        ],
        onSubmit: async (v) => {
          const body = {
            name: v.name,
            task_order: Number(v.task_order),
            payment_value_kes: Number(v.payment_value_kes),
            description: v.description,
            due_date: v.due_date,
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
  const initialModalValues = modal?.item
    ? Object.fromEntries(Object.entries(modal.item).map(([k, v]) => [k, v == null ? '' : String(v)]))
    : modal?.type === 'programs' && sectors[0]
      ? { sector_id: sectors[0].id }
      : modal?.type === 'projects' && programs[0]
        ? { program_id: programs[0].id }
        : undefined;

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.contentPad}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  tabBar: { maxHeight: 48, backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBarContent: { paddingHorizontal: 8, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 12, marginHorizontal: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, color: COLORS.muted, fontWeight: '600' },
  tabTextActive: { color: COLORS.primary },
  content: { flex: 1 },
  contentPad: { padding: 16, paddingBottom: 40 },
  newBtn: { marginBottom: 16 },
  filterBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  preview: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.muted, marginBottom: 8, marginTop: 8 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: COLORS.background,
  },
  selected: { borderWidth: 2, borderColor: COLORS.primary },
});
