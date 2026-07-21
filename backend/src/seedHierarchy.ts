import { v4 as uuidv4 } from 'uuid';
import { db } from './db/database';
import {
  createSector,
  createProgram,
  createProgramProject,
  createTask,
  assignFarmersToProject,
} from './services/hierarchyService';

const DEMO_FARMER_PHONE = '+254712345678';
const DEMO_PROJECT_NAME = 'Tree Planting Project - Nairobi Q3 2026';

function findDemoProjectId(): string | null {
  const row = db.prepare('SELECT id FROM program_projects WHERE name = ?').get(DEMO_PROJECT_NAME) as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

function linkDemoFarmerUser(): string | null {
  const farmer = db.prepare('SELECT farmer_id FROM farmers WHERE phone_number = ?').get(DEMO_FARMER_PHONE) as
    | { farmer_id: string }
    | undefined;
  if (!farmer) return null;

  db.prepare('UPDATE users SET farmer_id = ? WHERE phone_number = ? AND farmer_id IS NULL').run(
    farmer.farmer_id,
    DEMO_FARMER_PHONE
  );
  return farmer.farmer_id;
}

function seedFullHierarchy(): string {
  console.log('Seeding Phase 2 hierarchy (Conservation → Tree Planting → Nairobi)...');

  const sector = createSector({
    name: 'Conservation',
    description: 'Environmental conservation programs',
    country: 'Kenya',
  }) as { id: string };

  const program = createProgram({
    name: 'Tree Planting',
    sector_id: sector.id,
    description: 'Planting and nurturing trees in Nairobi region',
  }) as { id: string };

  const admin = db.prepare("SELECT user_id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1").get() as
    | { user_id: string }
    | undefined;

  const project = createProgramProject({
    name: DEMO_PROJECT_NAME,
    program_id: program.id,
    region: 'Nairobi',
    budget_kes: 20000,
    start_date: '2026-07-15',
    end_date: '2026-10-15',
    country_manager_id: admin?.user_id,
  }) as unknown as { id: string };

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
    createTask({
      program_project_id: project.id,
      name: t.name,
      description: `Complete ${t.name}`,
      task_order: t.order,
      payment_value_kes: t.value,
      due_date: due.toISOString().split('T')[0],
    });
  }

  db.prepare(`
    INSERT OR IGNORE INTO aggregation_centres (
      centre_id, name, country, location_level_1, region, status, manager_name, manager_phone
    ) VALUES (?, ?, 'Kenya', 'Nairobi', 'Nairobi', 'Active', 'James Kipchoge', ?)
  `).run(uuidv4(), 'Nairobi Market Hub', DEMO_FARMER_PHONE);

  return project.id;
}

/** Seed hierarchy if missing; always ensure demo farmer John Doe is assigned. */
export function seedHierarchyIfEmpty(): void {
  let projectId = findDemoProjectId();

  const sectorCount = db.prepare('SELECT COUNT(*) as c FROM sectors').get() as { c: number };
  if (sectorCount.c === 0 || !projectId) {
    projectId = seedFullHierarchy();
  }

  linkDemoFarmerUser();

  const demoFarmerId = db.prepare('SELECT farmer_id FROM farmers WHERE phone_number = ?').get(DEMO_FARMER_PHONE) as
    | { farmer_id: string }
    | undefined;
  const farmersToAssign: string[] = [];

  if (demoFarmerId) farmersToAssign.push(demoFarmerId.farmer_id);

  const extras = db.prepare('SELECT farmer_id FROM farmers LIMIT 10').all() as { farmer_id: string }[];
  for (const f of extras) {
    if (!farmersToAssign.includes(f.farmer_id)) farmersToAssign.push(f.farmer_id);
  }

  if (projectId && farmersToAssign.length > 0) {
    assignFarmersToProject(projectId, farmersToAssign);
    const fid = demoFarmerId?.farmer_id ?? farmersToAssign[0];
    const taskCount = db.prepare(`
      SELECT COUNT(*) as c FROM farmer_tasks WHERE program_project_id = ? AND farmer_id = ?
    `).get(projectId, fid) as { c: number };
    console.log(`Hierarchy ready: project ${projectId}, demo farmer tasks: ${taskCount?.c ?? 0}`);
  }
}
