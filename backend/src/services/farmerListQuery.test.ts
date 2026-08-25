import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFarmerListWhere,
  farmerListScopeForViewer,
} from './farmerListQuery';

test('country and q stay AND-ed (search does not drop country)', () => {
  const { sql, params } = buildFarmerListWhere(
    { kind: 'unrestricted' },
    { country: 'Kenya', q: 'Jane' }
  );
  assert.match(sql, /f\.country/);
  assert.match(sql, /f\.name ILIKE/);
  assert.equal(params[0], 'Kenya');
  assert.ok((params[1] as string).includes('Jane'));
});

test('district scope stays in SQL when filtering by project or cooperative', () => {
  const project = buildFarmerListWhere(
    { kind: 'district', district: 'Kilifi' },
    { programProjectId: 'proj-1' }
  );
  assert.match(project.sql, /f\.district/);
  assert.match(project.sql, /program_project_farmers/);
  assert.equal(project.params[0], 'Kilifi');
  assert.equal(project.params[1], 'proj-1');
  assert.match(project.sql, /AND/);

  const coop = buildFarmerListWhere(
    { kind: 'district', district: 'Kilifi' },
    { membershipGroupId: 'coop-1' }
  );
  assert.match(coop.sql, /f\.district/);
  assert.match(coop.sql, /membership_group_id/);
  assert.equal(coop.params[0], 'Kilifi');
  assert.equal(coop.params[1], 'coop-1');
});

test('empty scoped role matches no rows even if filters would otherwise match', () => {
  const { sql, params } = buildFarmerListWhere(
    { kind: 'none' },
    { country: 'Kenya', programProjectId: 'proj-1', q: 'anyone' }
  );
  assert.match(sql, /1 = 0/);
  assert.ok(sql.startsWith('WHERE 1 = 0'));
  assert.ok(params.includes('Kenya'));
});

test('platform/super_admin are unrestricted; agent/admin require district or region', () => {
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'platform_admin', district: 'Kilifi' }),
    { kind: 'unrestricted' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'super_admin' }),
    { kind: 'unrestricted' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'agent', district: 'Kilifi', region: 'Coast' }),
    { kind: 'district', district: 'Kilifi' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'admin', district: 'Kilifi', region: 'Coast' }),
    { kind: 'district', district: 'Kilifi' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'admin', region: 'Kilifi' }),
    { kind: 'district', district: 'Kilifi' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'agent', region: 'Coast' }),
    { kind: 'agent_region', region: 'Coast' }
  );
  assert.deepEqual(
    farmerListScopeForViewer({ role: 'agent' }),
    { kind: 'none' }
  );
});
