import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from './db/database';
import {
  createSector,
  createProgram,
  createProgramProject,
  createTask,
  assignFarmersToProject,
} from './services/hierarchyService';

const DEMO_FARMER_PHONE = '+254712345678';
const DEMO_PROJECT_NAME = 'Tree Planting Project - Nairobi Q3 2026';

async function findDemoProjectId(): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM program_projects WHERE name = $1',
    [DEMO_PROJECT_NAME]
  );
  return row?.id ?? null;
}

async function linkDemoFarmerUser(): Promise<string | null> {
  const farmer = await queryOne<{ farmer_id: string }>(
    'SELECT farmer_id FROM farmers WHERE phone_number = $1',
    [DEMO_FARMER_PHONE]
  );
  if (!farmer) return null;

  await query(
    'UPDATE users SET farmer_id = $1 WHERE phone_number = $2 AND farmer_id IS NULL',
    [farmer.farmer_id, DEMO_FARMER_PHONE]
  );
  return farmer.farmer_id;
}

async function seedFullHierarchy(): Promise<string> {
  console.log('Seeding Phase 2 hierarchy (Conservation → Tree Planting → Nairobi)...');

  const sector = (await createSector({
    name: 'Conservation',
    description: 'Environmental conservation programs',
    country: 'Kenya',
  })) as { id: string };

  const program = (await createProgram({
    name: 'Tree Planting',
    sector_id: sector.id,
    description: 'Planting and nurturing trees in Nairobi region',
  })) as { id: string };

  const admin = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM users WHERE role::text IN ('admin', 'super_admin', 'platform_admin') LIMIT 1`
  );

  const project = (await createProgramProject({
    name: DEMO_PROJECT_NAME,
    program_id: program.id,
    region: 'Nairobi',
    budget_kes: 20000,
    start_date: '2026-07-15',
    end_date: '2026-10-15',
    country_manager_id: admin?.user_id,
  })) as unknown as { id: string };

  const taskDefs = [
    { name: 'Farmer Training', order: 1, value: 4000, days: 7 },
    { name: 'Obtain Seedlings', order: 2, value: 4000, days: 14 },
    { name: 'Site Preparation', order: 3, value: 4000, days: 21 },
    { name: 'Plant Trees', order: 4, value: 4000, days: 28 },
    { name: 'Inspection & Sign-off', order: 5, value: 4000, days: 35 },
  ];

  for (const t of taskDefs) {
    const due = new Date();
    due.setDate(due.getDate() + t.days);
    await createTask({
      program_project_id: project.id,
      name: t.name,
      description: `Complete ${t.name}`,
      task_order: t.order,
      payment_value_kes: t.value,
      due_date: due.toISOString().split('T')[0],
    });
  }

  await query(
    `INSERT INTO aggregation_centres (
      centre_id, name, country, location_level_1, region, status, manager_name, manager_phone
    ) VALUES ($1, $2, 'Kenya', 'Nairobi', 'Nairobi', 'Active', 'James Kipchoge', $3)
    ON CONFLICT (centre_id) DO NOTHING`,
    ['ke-nairobi-market-01', 'Nairobi Market Hub', DEMO_FARMER_PHONE]
  );

  return project.id;
}

/** Seed hierarchy if missing; ensure demo farmer John Doe is assigned (idempotent). */
export async function seedHierarchyIfEmpty(): Promise<void> {
  let projectId = await findDemoProjectId();

  const sectorCount = await queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM sectors');
  if (!projectId) {
    if ((sectorCount?.c ?? 0) === 0) {
      projectId = await seedFullHierarchy();
    } else {
      console.log('Hierarchy data exists but demo project missing — skipping auto-seed to avoid duplicates');
      return;
    }
  }

  const demoFarmerId = await linkDemoFarmerUser();
  if (!projectId || !demoFarmerId) return;

  await assignFarmersToProject(projectId, [demoFarmerId]);

  const taskCount = await queryOne<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM farmer_tasks WHERE program_project_id = $1 AND farmer_id = $2`,
    [projectId, demoFarmerId]
  );
  console.log(`Hierarchy ready: project ${projectId}, demo farmer tasks: ${taskCount?.c ?? 0}`);
}
