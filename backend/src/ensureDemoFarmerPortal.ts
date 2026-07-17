import { v4 as uuidv4 } from 'uuid';
import { db } from './db/database';
import { createUser } from './services/userService';

const DEMO_FARMER_PHONE = '+254712345678';
const DEMO_FARMER = {
  key: 'DEMO-001',
  name: 'John Doe',
  gender: 'M',
  idNumber: '99999999',
  membershipGroup: 'Test Coop',
  district: 'Kiambu',
  subCounty: 'Limuru',
};

const LEGACY_PROJECTS = [
  'Coffee Training',
  'Soil Health',
  'Baseline Survey',
  'Water Conservation',
  'Pest Management',
];

/** Always ensure demo login accounts + portal data work, even with 2617+ imported farmers. */
export function ensureDemoFarmerPortal(): void {
  ensureMembershipGroup(DEMO_FARMER.membershipGroup);
  const projectIds = ensureLegacyProjects();
  const farmerId = ensureDemoFarmerRecord();
  if (!farmerId) {
    console.warn('Demo farmer record could not be created');
    return;
  }

  ensureDemoFarmerUser(farmerId);
  ensureDemoStaffUsers();
  ensureDemoFarmerLegacyData(farmerId, projectIds);
  console.log(`Demo farmer portal ready: ${DEMO_FARMER.name} (${farmerId.slice(0, 8)}…)`);
}

function ensureMembershipGroup(name: string): string {
  const existing = db.prepare('SELECT id FROM membership_groups WHERE name = ?').get(name) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;
  const id = uuidv4();
  db.prepare('INSERT INTO membership_groups (id, name) VALUES (?, ?)').run(id, name);
  return id;
}

function ensureLegacyProjects(): Record<string, string> {
  const insert = db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)');
  for (const name of LEGACY_PROJECTS) {
    insert.run(uuidv4(), name);
  }
  const rows = db.prepare('SELECT id, name FROM projects').all() as { id: string; name: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.name] = r.id;
  return map;
}

function ensureDemoFarmerRecord(): string | null {
  const existing = db.prepare('SELECT farmer_id FROM farmers WHERE phone_number = ?').get(DEMO_FARMER_PHONE) as
    | { farmer_id: string }
    | undefined;
  if (existing) return existing.farmer_id;

  const groupId = ensureMembershipGroup(DEMO_FARMER.membershipGroup);
  const farmerId = uuidv4();
  db.prepare(`
    INSERT INTO farmers (
      farmer_id, key, name, gender, id_number, membership_group_id,
      phone_number, country, district, sub_county, membership_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Kenya', ?, ?, 'Active', 'Active')
  `).run(
    farmerId, DEMO_FARMER.key, DEMO_FARMER.name, DEMO_FARMER.gender,
    DEMO_FARMER.idNumber, groupId, DEMO_FARMER_PHONE,
    DEMO_FARMER.district, DEMO_FARMER.subCounty
  );
  return farmerId;
}

function ensureDemoFarmerUser(farmerId: string): void {
  const existing = db.prepare('SELECT user_id, farmer_id FROM users WHERE phone_number = ?').get(DEMO_FARMER_PHONE) as
    | { user_id: string; farmer_id: string | null }
    | undefined;

  if (!existing) {
    createUser({
      phoneNumber: DEMO_FARMER_PHONE,
      name: DEMO_FARMER.name,
      role: 'farmer',
      farmerId,
      district: DEMO_FARMER.district,
    });
    return;
  }

  if (!existing.farmer_id) {
    db.prepare('UPDATE users SET farmer_id = ? WHERE user_id = ?').run(farmerId, existing.user_id);
  }
}

function ensureDemoStaffUsers(): void {
  const staff = [
    { phone: '+254700000001', name: 'Super Admin', role: 'super_admin' as const },
    { phone: '+254700000002', name: 'Platform Admin', role: 'admin' as const },
    { phone: '+254700000003', name: 'Kiambu Agent', role: 'agent' as const, district: 'Kiambu', aggregationCenter: 'Kiambu Town Hall' },
  ];
  for (const s of staff) {
    const row = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(s.phone);
    if (!row) {
      createUser({
        phoneNumber: s.phone,
        name: s.name,
        role: s.role,
        district: 'district' in s ? s.district : undefined,
        aggregationCenter: 'aggregationCenter' in s ? s.aggregationCenter : undefined,
      });
    }
  }
}

function ensureDemoFarmerLegacyData(farmerId: string, projectIds: Record<string, string>): void {
  const hasProjects = db.prepare('SELECT id FROM farmer_projects WHERE farmer_id = ? LIMIT 1').get(farmerId);
  if (hasProjects) return;

  const coffeeId = projectIds['Coffee Training'];
  const soilId = projectIds['Soil Health'];
  if (!coffeeId || !soilId) return;

  const fp1 = uuidv4();
  db.prepare(`
    INSERT INTO farmer_projects (id, farmer_id, project_id, project_name, payment_amount, status, completion_percentage, earnings_amount, payment_status, start_date, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fp1, farmerId, coffeeId, 'Coffee Training', 15000, 'In Progress', 60, 15000, 'Pending', '2026-06-01', '2026-08-01');

  db.prepare(`
    INSERT INTO farmer_projects (id, farmer_id, project_id, project_name, payment_amount, status, completion_percentage, earnings_amount, payment_status, start_date, due_date, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), farmerId, soilId, 'Soil Health', 8000, 'Completed', 100, 8000, 'Transferred', '2026-03-01', '2026-05-01', '2026-05-15');

  db.prepare(`
    INSERT INTO payments (id, farmer_id, farmer_project_id, project_name, amount, payment_status, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), farmerId, fp1, 'Coffee Training', 15000, 'Pending', 'M-Pesa');

  db.prepare(`
    INSERT INTO payments (id, farmer_id, project_name, amount, payment_status, payment_method, mpesa_reference, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 days'))
  `).run(uuidv4(), farmerId, 'Soil Health', 8000, 'Transferred', 'M-Pesa', 'MPX123456');
}
