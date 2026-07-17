import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/db/database';
import {
  createSector,
  createProgram,
  createProgramProject,
  createTask,
  assignFarmersToProject,
} from '../src/services/hierarchyService';

/** Seed demo hierarchy if sectors table is empty. Safe to call on every startup. */
export function seedHierarchyIfEmpty(): void {
  const existing = db.prepare('SELECT COUNT(*) as c FROM sectors').get() as { c: number };
  if (existing.c > 0) return;

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
    name: 'Tree Planting Project - Nairobi Q3 2026',
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

  const farmers = db.prepare('SELECT farmer_id FROM farmers LIMIT 10').all() as { farmer_id: string }[];
  const farmerIds = farmers.map((f) => f.farmer_id);
  if (farmerIds.length > 0) {
    assignFarmersToProject(project.id, farmerIds);
  }

  // Demo aggregation centre for UAT
  db.prepare(`
    INSERT OR IGNORE INTO aggregation_centres (
      centre_id, name, country, location_level_1, region, status, manager_name, manager_phone
    ) VALUES (?, ?, 'Kenya', 'Nairobi', 'Nairobi', 'Active', 'James Kipchoge', '+254712345678')
  `).run(uuidv4(), 'Nairobi Market Hub');

  console.log(`Hierarchy seeded: project ${project.id}, ${farmerIds.length} farmers assigned`);
}
