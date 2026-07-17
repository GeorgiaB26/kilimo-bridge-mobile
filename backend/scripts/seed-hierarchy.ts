/**
 * Seeds Phase 2 hierarchy: Conservation → Tree Planting → Nairobi project → 5 tasks.
 * Run: npm run seed:hierarchy (from backend/)
 */
import { initDatabase } from '../src/db/database';
import { seedDatabase } from '../src/seed';
import { seedHierarchyIfEmpty } from '../src/seedHierarchy';

function main(): void {
  initDatabase();
  seedDatabase();
  seedHierarchyIfEmpty();
  console.log('Done.');
}

main();
