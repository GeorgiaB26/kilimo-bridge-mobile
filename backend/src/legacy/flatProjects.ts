/**
 * Legacy flat `projects` + `farmer_projects` tables are retired.
 * Dashboard, admin detail, stats, and CSV enrollment use Phase 2
 * (`program_project_farmers` / `farmer_tasks`) via farmerProgramService.
 */
export const LEGACY_FLAT_PROJECTS_ENABLED = false;
