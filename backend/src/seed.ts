import { v4 as uuidv4 } from 'uuid';
import { db } from './db/database';

const MEMBERSHIP_GROUPS = [
  'Gulu Women Economic Dev',
  'Kiambu Cooperative',
  'Nairobi Women Coop',
  'Test Coop',
];

const PROJECTS = [
  'Coffee Training',
  'Soil Health',
  'Baseline Survey',
  'Water Conservation',
  'Pest Management',
];

export function seedDatabase(): void {
  const insertGroup = db.prepare(
    'INSERT OR IGNORE INTO membership_groups (id, name) VALUES (?, ?)'
  );
  for (const name of MEMBERSHIP_GROUPS) {
    insertGroup.run(uuidv4(), name);
  }

  const insertProject = db.prepare(
    'INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)'
  );
  for (const name of PROJECTS) {
    insertProject.run(uuidv4(), name);
  }
}
