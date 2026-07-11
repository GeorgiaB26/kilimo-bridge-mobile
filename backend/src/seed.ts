import { v4 as uuidv4 } from 'uuid';
import { db } from './db/database';
import { createUser } from './services/userService';
import { registerAgent } from './services/agentService';
import { seedAggregationCentres } from './services/aggregationCentreService';
import bcrypt from 'bcryptjs';

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

/** Demo farmer always available for quick login */
const DEMO_FARMER = {
  key: 'DEMO-001',
  name: 'John Doe',
  phone: '+254712345678',
  gender: 'M',
  idNumber: '99999999',
  membershipGroup: 'Test Coop',
  district: 'Kiambu',
  subCounty: 'Limuru',
};

export function seedDatabase(): void {
  seedAggregationCentres();

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

  const projectIds: Record<string, string> = {};
  const rows = db.prepare('SELECT id, name FROM projects').all() as { id: string; name: string }[];
  for (const r of rows) projectIds[r.name] = r.id;

  seedDemoFarmerRecord();
  seedStaffUsers();
  seedUsers();
  seedDemoFarmerData(projectIds);
}

function seedStaffUsers(): void {
  const bankingPhone = '+254700000004';
  const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(bankingPhone);
  if (!existing) {
    const passwordHash = bcrypt.hashSync('Banking@2026', 12);
    createUser({
      phoneNumber: bankingPhone,
      name: 'Equity Banking Officer',
      role: 'banking',
      passwordHash,
    });
  }

  const agentPhone = '+254700000003';
  const agentExists = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(agentPhone);
  if (!agentExists) {
    try {
      registerAgent({
        phoneNumber: agentPhone,
        name: 'Kiambu Agent',
        governmentId: 'GOV-AGENT-001',
        aggregationCenter: 'Kiambu Town Hall',
        region: 'Central',
        district: 'Kiambu',
      });
      // Auto-verify demo agent
      const agent = db.prepare('SELECT agent_id FROM agents a JOIN users u ON a.user_id = u.user_id WHERE u.phone_number = ?').get(agentPhone) as { agent_id: string } | undefined;
      if (agent) {
        db.prepare(`UPDATE agents SET status = 'active', verified_at = datetime('now') WHERE agent_id = ?`).run(agent.agent_id);
      }
    } catch {
      createUser({
        phoneNumber: agentPhone,
        name: 'Kiambu Agent',
        role: 'agent',
        district: 'Kiambu',
        region: 'Central',
        aggregationCenter: 'Kiambu Town Hall',
      });
    }
  }
}

function seedDemoFarmerRecord(): void {
  const existing = db.prepare('SELECT farmer_id FROM farmers WHERE phone_number = ?').get(DEMO_FARMER.phone);
  if (existing) return;

  const group = db.prepare('SELECT id FROM membership_groups WHERE name = ?').get(DEMO_FARMER.membershipGroup) as { id: string } | undefined;
  if (!group) return;

  db.prepare(`
    INSERT INTO farmers (
      farmer_id, key, name, gender, id_number, membership_group_id,
      phone_number, country, district, sub_county, membership_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Kenya', ?, ?, 'Active', 'Active')
  `).run(
    uuidv4(), DEMO_FARMER.key, DEMO_FARMER.name, DEMO_FARMER.gender,
    DEMO_FARMER.idNumber, group.id, DEMO_FARMER.phone,
    DEMO_FARMER.district, DEMO_FARMER.subCounty
  );
}

function seedUsers(): void {
  const users = [
    { phone: '+254700000001', name: 'Super Admin', role: 'super_admin' as const },
    { phone: '+254700000002', name: 'Platform Admin', role: 'admin' as const },
  ];

  for (const u of users) {
    const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(u.phone);
    if (!existing) {
      createUser({ phoneNumber: u.phone, name: u.name, role: u.role });
    }
  }

  // Link farmer accounts to existing farmers
  const farmers = db.prepare('SELECT farmer_id, phone_number, name FROM farmers LIMIT 10').all() as {
    farmer_id: string;
    phone_number: string;
    name: string;
  }[];

  for (const f of farmers) {
    const existing = db.prepare('SELECT user_id FROM users WHERE phone_number = ?').get(f.phone_number);
    if (!existing) {
      createUser({ phoneNumber: f.phone_number, name: f.name, role: 'farmer', farmerId: f.farmer_id });
    }
  }
}

function seedDemoFarmerData(projectIds: Record<string, string>): void {
  const farmers = db.prepare('SELECT farmer_id FROM farmers LIMIT 5').all() as { farmer_id: string }[];

  for (const { farmer_id } of farmers) {
    const hasProjects = db.prepare('SELECT id FROM farmer_projects WHERE farmer_id = ?').get(farmer_id);
    if (hasProjects) continue;

    const fp1 = uuidv4();
    db.prepare(`
      INSERT INTO farmer_projects (id, farmer_id, project_id, project_name, payment_amount, status, completion_percentage, earnings_amount, payment_status, start_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fp1, farmer_id, projectIds['Coffee Training'], 'Coffee Training', 15000, 'In Progress', 60, 15000, 'Pending', '2026-06-01', '2026-08-01');

    db.prepare(`
      INSERT INTO farmer_projects (id, farmer_id, project_id, project_name, payment_amount, status, completion_percentage, earnings_amount, payment_status, start_date, due_date, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), farmer_id, projectIds['Soil Health'], 'Soil Health', 8000, 'Completed', 100, 8000, 'Transferred', '2026-03-01', '2026-05-01', '2026-05-15');

    db.prepare(`
      INSERT INTO payments (id, farmer_id, farmer_project_id, project_name, amount, payment_status, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), farmer_id, fp1, 'Coffee Training', 15000, 'Pending', 'M-Pesa');

    db.prepare(`
      INSERT INTO payments (id, farmer_id, project_name, amount, payment_status, payment_method, mpesa_reference, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 days'))
    `).run(uuidv4(), farmer_id, 'Soil Health', 8000, 'Transferred', 'M-Pesa', 'MPX123456');

    const user = db.prepare('SELECT user_id FROM users WHERE farmer_id = ?').get(farmer_id) as { user_id: string } | undefined;
    if (user) {
      const hasNotif = db.prepare('SELECT id FROM notifications WHERE user_id = ?').get(user.user_id);
      if (!hasNotif) {
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), user.user_id, 'Payment Ready', 'Your M-Pesa payment of 15,000 KES is ready to claim', 'payment');
        db.prepare(`
          INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), user.user_id, 'New Project', 'Coffee Training project assigned — 60% complete', 'project');
      }
    }
  }
}
