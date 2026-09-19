import { isAgentRole, isRegionalAdminRole, normalizeRole } from '../../../shared/src/roles';

export type FarmerListScope =
  | { kind: 'unrestricted' }
  | { kind: 'none' }
  | { kind: 'district'; district: string }
  | { kind: 'agent_region'; region: string };

export type FarmerListFilters = {
  country?: string;
  membershipGroupId?: string;
  programProjectId?: string;
  q?: string;
};

/**
 * Role scope is a hard WHERE on farmers.district (farmers have no region column).
 * Filters AND with this clause — they cannot widen or replace it.
 */
export function farmerListScopeForViewer(viewer: {
  role: string;
  district?: string | null;
  region?: string | null;
}): FarmerListScope {
  const role = normalizeRole(viewer.role);
  if (role === 'platform_admin' || role === 'super_admin') {
    return { kind: 'unrestricted' };
  }
  const district = viewer.district?.trim();
  const region = viewer.region?.trim();
  if (isAgentRole(role)) {
    if (district) return { kind: 'district', district };
    if (region) return { kind: 'agent_region', region };
    return { kind: 'none' };
  }
  if (isRegionalAdminRole(role)) {
    const scope = district || region;
    if (scope) return { kind: 'district', district: scope };
    return { kind: 'none' };
  }
  return { kind: 'none' };
}

export function parseFarmerListFilters(query: {
  country?: unknown;
  membership_group_id?: unknown;
  program_project_id?: unknown;
  q?: unknown;
}): FarmerListFilters {
  const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  return {
    country: str(query.country),
    membershipGroupId: str(query.membership_group_id),
    programProjectId: str(query.program_project_id),
    q: str(query.q),
  };
}

function searchClauses(term: string, nextIndex: () => string): { sql: string; params: string[] } {
  const pattern = `%${term}%`;
  const phoneDigits = term.replace(/\D/g, '');
  const params: string[] = [];
  const parts: string[] = [];
  const add = (sql: string, value: string) => {
    parts.push(sql.replace('?', nextIndex()));
    params.push(value);
  };
  add('f.name ILIKE ?', pattern);
  add('f.district ILIKE ?', pattern);
  add('mg.name ILIKE ?', pattern);
  if (phoneDigits.length >= 3) {
    add('f.phone_number LIKE ?', `%${phoneDigits}%`);
  }
  for (const token of term.split(/\s+/).filter((p) => p.length >= 2)) {
    if (token.toLowerCase() === term.toLowerCase()) continue;
    add('f.name ILIKE ?', `%${token}%`);
  }
  return { sql: `(${parts.join(' OR ')})`, params };
}

/** Pure WHERE builder — used by list/count and by tests that prove scope cannot be bypassed. */
export function buildFarmerListWhere(
  scope: FarmerListScope,
  filters: FarmerListFilters = {}
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  const placeholder = () => `$${idx++}`;

  switch (scope.kind) {
    case 'none':
      clauses.push('1 = 0');
      break;
    case 'district':
      clauses.push(`lower(trim(f.district)) = lower(trim(${placeholder()}))`);
      params.push(scope.district);
      break;
    case 'agent_region':
      clauses.push(
        `f.district IN (SELECT DISTINCT district FROM agents WHERE region = ${placeholder()})`
      );
      params.push(scope.region);
      break;
    case 'unrestricted':
      break;
  }

  if (filters.country) {
    clauses.push(`lower(trim(f.country)) = lower(trim(${placeholder()}))`);
    params.push(filters.country);
  }
  if (filters.membershipGroupId) {
    clauses.push(`f.membership_group_id = ${placeholder()}`);
    params.push(filters.membershipGroupId);
  }
  if (filters.programProjectId) {
    clauses.push(
      `EXISTS (SELECT 1 FROM program_project_farmers pf WHERE pf.farmer_id = f.farmer_id AND pf.program_project_id = ${placeholder()})`
    );
    params.push(filters.programProjectId);
  }
  if (filters.q) {
    const search = searchClauses(filters.q, placeholder);
    clauses.push(search.sql);
    params.push(...search.params);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}
