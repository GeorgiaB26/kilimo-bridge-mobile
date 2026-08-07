import { query, queryOne } from '../db/database';
import {
  assignFarmersToProject,
  createProgram,
  createProgramProject,
  createSector,
} from './hierarchyService';
import {
  findProgramProjectIdByNormalizedName,
  normalizeProjectName,
  type ProgramProjectNameRow,
} from './projectNameMatching';

/** Sector/program bucket for CSV-created program_projects (not in admin hierarchy UI). */
const CSV_IMPORT_SECTOR = 'CSV Import';
const CSV_IMPORT_PROGRAM = 'Imported Projects';

export type FarmerProgramProjectRow = {
  id: string;
  name: string;
  program_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_kes: number | null;
  task_count: number;
  completed_task_count: number;
  payment_total: number;
  next_due_date: string | null;
};

export type FarmerProjectSummary = {
  id: string;
  project_id: string;
  project_name: string;
  payment_amount: number;
  status: string;
  completion_percentage: number;
  due_date?: string;
  start_date?: string;
  payment_status?: string;
  tasks_completed: number;
  tasks_total: number;
  progress_label: string;
};

const FARMER_PROJECTS_SQL = `
  SELECT pp.id, pp.name, pp.status, pp.start_date, pp.end_date, pp.budget_kes,
    p.name AS program_name,
    (SELECT COUNT(*)::int FROM farmer_tasks ft
      WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1) AS task_count,
    (SELECT COUNT(*)::int FROM farmer_tasks ft
      WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1
        AND ft.status IN ('approved', 'completed')) AS completed_task_count,
    (SELECT COALESCE(SUM(t.payment_value_kes), 0)::float FROM farmer_tasks ft
      JOIN tasks t ON t.id = ft.task_id
      WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1) AS payment_total,
    (SELECT MIN(t.due_date::text) FROM farmer_tasks ft
      JOIN tasks t ON t.id = ft.task_id
      WHERE ft.program_project_id = pp.id AND ft.farmer_id = $1
        AND ft.status NOT IN ('approved', 'completed') AND t.due_date IS NOT NULL) AS next_due_date
  FROM program_project_farmers pf
  JOIN program_projects pp ON pp.id = pf.program_project_id
  JOIN programs p ON p.id = pp.program_id
  WHERE pf.farmer_id = $1
  ORDER BY pp.name
`;

function mapToFarmerProjectSummary(row: FarmerProgramProjectRow): FarmerProjectSummary {
  const tasksTotal = row.task_count ?? 0;
  const tasksCompleted = row.completed_task_count ?? 0;
  const completionPercentage =
    tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const allComplete = tasksTotal > 0 && tasksCompleted >= tasksTotal;

  return {
    id: row.id,
    project_id: row.id,
    project_name: row.name,
    payment_amount: row.payment_total ?? row.budget_kes ?? 0,
    status: allComplete ? 'Completed' : 'In Progress',
    completion_percentage: completionPercentage,
    due_date: row.next_due_date ?? row.end_date ?? undefined,
    start_date: row.start_date ?? undefined,
    payment_status: allComplete ? 'Transferred' : 'Pending',
    tasks_completed: tasksCompleted,
    tasks_total: tasksTotal,
    progress_label: `${tasksCompleted} of ${tasksTotal} tasks complete`,
  };
}

function isActiveEnrollment(row: FarmerProgramProjectRow): boolean {
  if (row.status !== 'active') return false;
  const total = row.task_count ?? 0;
  const completed = row.completed_task_count ?? 0;
  return total > completed;
}

export async function listFarmerProgramProjectRows(farmerId: string): Promise<FarmerProgramProjectRow[]> {
  return query<FarmerProgramProjectRow>(FARMER_PROJECTS_SQL, [farmerId]);
}

export async function getFarmerProjectSummaries(farmerId: string): Promise<FarmerProjectSummary[]> {
  const rows = await listFarmerProgramProjectRows(farmerId);
  return rows.map(mapToFarmerProjectSummary);
}

export async function getFarmerActiveProjectSummaries(farmerId: string): Promise<FarmerProjectSummary[]> {
  const rows = await listFarmerProgramProjectRows(farmerId);
  return rows.filter(isActiveEnrollment).map(mapToFarmerProjectSummary);
}

export async function countActiveProgramProjects(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM program_projects WHERE status = 'active'`
  );
  return row?.count ?? 0;
}

async function loadProgramProjectCatalog(): Promise<ProgramProjectNameRow[]> {
  return query<ProgramProjectNameRow>(
    'SELECT id, name FROM program_projects ORDER BY created_at ASC'
  );
}

export async function getProgramProjectCatalog(): Promise<ProgramProjectNameRow[]> {
  return loadProgramProjectCatalog();
}

export { normalizeProjectName, findSimilarProgramProject, formatSimilarProjectHint } from './projectNameMatching';

export async function findProgramProjectIdByName(name: string): Promise<string | null> {
  const catalog = await loadProgramProjectCatalog();
  return findProgramProjectIdByNormalizedName(name, catalog);
}

async function ensureCsvImportProgramId(): Promise<string> {
  let sector = await queryOne<{ id: string }>(
    `SELECT id FROM sectors WHERE lower(trim(name)) = lower(trim($1)) LIMIT 1`,
    [CSV_IMPORT_SECTOR]
  );
  if (!sector) {
    const created = (await createSector({ name: CSV_IMPORT_SECTOR, country: 'Kenya' })) as { id: string };
    sector = { id: created.id };
  }

  let program = await queryOne<{ id: string }>(
    `SELECT id FROM programs WHERE sector_id = $1 AND lower(trim(name)) = lower(trim($2)) LIMIT 1`,
    [sector.id, CSV_IMPORT_PROGRAM]
  );
  if (!program) {
    const created = (await createProgram({
      name: CSV_IMPORT_PROGRAM,
      sector_id: sector.id,
      description: 'Auto-created from CSV import project columns',
    })) as { id: string };
    program = { id: created.id };
  }

  return program.id;
}

/** Find or create a program_project — normalized exact match, else create with trimmed CSV name. */
export async function ensureProgramProjectByName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name is required');

  const catalog = await loadProgramProjectCatalog();
  const existing = findProgramProjectIdByNormalizedName(trimmed, catalog);
  if (existing) return existing;

  const programId = await ensureCsvImportProgramId();
  await createProgramProject({
    name: trimmed,
    program_id: programId,
    region: 'Import',
  });

  const refreshed = await loadProgramProjectCatalog();
  const createdId = findProgramProjectIdByNormalizedName(trimmed, refreshed);
  if (!createdId) throw new Error(`Failed to create program project: ${trimmed}`);

  await query(
    `UPDATE program_projects SET status = 'active', updated_at = NOW() WHERE id = $1`,
    [createdId]
  );

  return createdId;
}

export async function enrollFarmerInProgramProjects(
  farmerId: string,
  projectNames: Array<string | undefined | null>
): Promise<number> {
  const names = [
    ...new Set(
      projectNames
        .map((n) => n?.trim())
        .filter((n): n is string => Boolean(n))
    ),
  ];

  let enrolled = 0;
  for (const name of names) {
    const projectId = await ensureProgramProjectByName(name);
    await assignFarmersToProject(projectId, [farmerId]);
    enrolled++;
  }
  return enrolled;
}

/** @deprecated Alias for CSV import — returns program_project id */
export async function getProjectIdByName(name: string): Promise<string | null> {
  return findProgramProjectIdByName(name);
}

/** @deprecated Alias for CSV import — ensures program_project exists */
export async function ensureProject(name: string): Promise<string> {
  return ensureProgramProjectByName(name);
}
