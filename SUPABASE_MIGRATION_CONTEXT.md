# Kilimo Bridge — Full Migration Context, Architecture & Working Practices

This document is written so that anyone — a human, or an AI assistant like Claude or Cursor reading this cold — has complete context on this project's database migration, the reasoning behind every major decision made, the full current database structure, and how to work on this codebase going forward without conflicting with or undoing what has already been built and verified working.

This is intentionally long and detailed. Do not summarize or skip sections when reading this into an AI assistant's context — the reasoning matters as much as the facts, because several of the decisions here were made specifically to avoid problems that weren't obvious at first glance.

---

## Part 1 — Background: what this project actually is, and how that understanding evolved

Kilimo Bridge was initially presented (via an investor/partner pitch deck from an entity called Drapius Capital) as an ambitious, internationally-focused agricultural trade platform — connecting African farmers to global buyers, with escrow/Letter-of-Credit trade finance, satellite crop monitoring, carbon credit marketplaces, and a multi-year roadmap running to 2030.

Separately, and independently, a real, working, actively-developed application already existed — built by Georgia Bone, originally using SQLite as its database, with a Node.js/Express backend and a React/React Native (Expo) frontend. This real, working application described a meaningfully different, much narrower, and much more concrete product than the pitch deck: not an international buyer marketplace, but a **task and training compliance system**. In this system:

- Farmers are assigned agricultural best-practice tasks (organized under a hierarchy of Sectors → Programs → Program Projects → Tasks)
- Farmers complete these tasks and submit photo evidence as proof
- Field agents verify farmers in person and review submitted task evidence
- Once a task is approved, the farmer is paid (via M-Pesa / a bank integration) for having completed it
- The underlying purpose is to raise farming standards (so that produce eventually meets the quality standards needed for the bigger buyer-facing vision described in the pitch deck) — but the buyer/marketplace side of the business does not exist in this MVP at all

This reconciliation — realizing that the pitch deck's vision and the actual, real, running codebase were two different altitudes of the same overall goal, not the same near-term plan — was an important early finding, because it meant that assumptions drawn purely from the pitch deck (e.g., that a native mobile app was strictly required from day one, that payments would go through escrow/Letters of Credit, that there would be three separate apps for farmer/buyer/admin) were not accurate reflections of what actually needed to be built. The real, actionable scope was defined by the existing codebase and by direct clarifying conversations, not by the investor deck.

### The real actor/role structure that emerged from this clarification

Three roles operate via the **mobile app** (built with Expo/React Native, one codebase producing both iOS and Android):
- **Farmer** — completes tasks, submits evidence, views payment status
- **Field Agent** (referred to in code as `agent`) — manages farmers in an assigned region/district, verifies new farmer registrations in person, reviews task submissions
- **Banking Agent** — processes individual payment transactions once a task has been approved and a payment is ready

Four roles operate via a **web-based admin panel** (same underlying application, gated by role, not a separate product):
- **Admin** — same day-to-day capabilities as Super Admin (approving registrations, assigning agents, tracking tasks) but scoped only to their own assigned region or cooperative
- **Super Admin** — full operational access: creates Sectors/Programs/Program Projects/Tasks, approves farmer registrations, assigns field agents, views all regional data and reports. Can create Admin/Agent/Farmer accounts, but cannot create or remove Super Admin or Platform Admin accounts
- **Platform Admin** — full system access, including the ability to create and remove Super Admin accounts. This is the technical/founding team tier (in the real system, this maps to accounts used by Georgia and other core technical staff)
- **Banking Admin** — oversees payment processing status and manages Banking Agent accounts specifically. Deliberately has **no access at all** to farmer, task, or hierarchy data — this isolation is intentional, reflecting that banking staff should only ever see payment-related information, nothing about the underlying agricultural/compliance data, likely for confidentiality/NDA reasons with the banking partner

This is a **7-role system**. Notably, the actual running codebase at the time this migration began only implemented **5 roles** (farmer, agent, admin, banking, super_admin) — the split between Admin/Super Admin/Platform Admin as three distinct tiers, and the split between Banking Agent/Banking Admin as two distinct tiers, existed only in planning documentation, not in the actual code. Bringing the code in line with the intended 7-role design was one of the significant pieces of work done during this migration (see Part 4).

---

## Part 2 — Why this migration happened: the reasoning, not just the outcome

The original application ran on **SQLite** — a lightweight, file-based database (a single file, `backend/data/kilimo.db`, on the server's disk). This is a completely reasonable choice for early, fast, solo development: no separate database server to configure, easy to reset and iterate on, no hosting costs. However, it has real, structural limitations that matter once a product needs to scale or be worked on by more than one person simultaneously:

1. **SQLite is designed for one process accessing it at a time.** It does not handle many simultaneous readers/writers well — a real concern for a system meant to eventually serve tens of thousands of farmers, field agents, and admin staff simultaneously.
2. **SQLite is a local file, not a networked, shared database.** Multiple applications (the farmer/agent/banking mobile app, and a separate admin web panel) both needing to read and write the *same* live data requires a proper client-server database that can be reached over a network — a single file on one server's disk cannot naturally serve that purpose.
3. **No built-in row-level security, real-time subscriptions, or managed authentication layer** — features a proper hosted Postgres service like Supabase provides essentially for free, which matter for a multi-role, multi-app system like this one.
4. **Team scaling**: with more than one person now working on this project (the intended near-term plan was one product designer/AI-assisted developer working solo, but this expanded during the course of this work to include coordination with Georgia directly), a shared, centrally-hosted database is a practical requirement — a SQLite file living on one person's Render deploy or one person's laptop cannot be the single source of truth for two people's work.

Supabase was chosen as the target because it provides a fully managed PostgreSQL database, along with authentication, row-level security, and other tooling, while still allowing the existing Express backend's own authentication/authorization logic to remain the primary security boundary (see Part 8, "Why RLS is currently disabled").

**Region chosen: London (`eu-west-2`)**. This was decided pragmatically — Supabase does not offer an African region, and after discussion, London (or Frankfurt) were identified as sensible defaults given that a large amount of East African internet traffic already routes through major European internet exchange points regardless of which cloud region is chosen. The actual latency difference between candidate regions (London, Frankfurt, Mumbai) was expected to be marginal for this kind of application (task submissions, occasional syncs — not latency-critical like video calls), so London was chosen as a safe, well-connected, unremarkable default rather than after exhaustive latency testing.

**Connection method: Transaction pooler, port 6543** (not the direct connection on port 5432). This matters because Supabase's direct connection is IPv6-only by default, and many hosting providers — including Render, which this project deploys to — do not reliably support outbound IPv6 without extra configuration. The pooler connection avoids this entirely and was confirmed as the correct choice for a Node.js backend running on Render.

---

## Part 3 — The complete current database schema

This section describes every table in the migrated Postgres database, its purpose, its columns, and its relationships. This replaces the original 22-table SQLite schema; two tables from the original schema (`projects` and `farmer_projects`) were deliberately not carried forward in their original form — see the detailed explanation in Part 5.

### Enum types (strict — Postgres will reject any value that does not exactly match)

- **`user_role`**: `farmer`, `agent`, `banking_agent`, `admin`, `super_admin`, `platform_admin`, `banking_admin`
- **`gender_type`**: `M`, `F`, `Other`
- **`farmer_status`**: `pending_review`, `pending_field_verification`, `verified`, `rejected`, `inactive`
- **`agent_status`**: `pending_verification`, `active`, `inactive`, `suspended`
- **`task_status`** (used on `farmer_tasks`): `not-started`, `submitted`, `approved`, `rejected`, `completed`
  - Note: the mobile app's API layer uses the string `'submitted-for-approval'` rather than `'submitted'` — this is intentionally translated at the boundary by helper functions (`toDbTaskStatus()` / `fromDbTaskStatus()`) inside the hierarchy service, so that the mobile app's existing expected wording doesn't need to change even though the database's internal value is different. This is a deliberate translation layer, not an inconsistency to "fix."
- **`payment_status`**: `pending`, `processing`, `transferred`, `failed`
- **`bank_transaction_status`**: `pending`, `processing`, `completed`, `failed`
- **`quality_status`**: `pending`, `passed`, `failed` (used by the aggregation centre / QC flow, which currently has no real data flowing through it yet)

### Core identity and organizational tables

**`membership_groups`** — represents a cooperative or farmer association (e.g. "Gulu Women Economic Dev", "Kiambu Cooperative"). Columns: `id` (UUID primary key), `name` (unique), `created_at`.

**`farmers`** — the central entity of the whole system. Columns include: `farmer_id` (UUID primary key), `key` (a human-readable external reference code, e.g. from a cooperative's own numbering), `name`, `gender` (enum), `id_number_encrypted` (AES-256-GCM encrypted, format `enc:iv:tag:ciphertext`), `id_number_hash` (deterministic HMAC-SHA256 hash of the normalized ID number — see Part 6 for why this exists separately from the encrypted field), `membership_group_id` (foreign key), `aggregation_center`, `phone_number` (unique — this is the farmer's login identifier via OTP), `country`, `district`, `sub_county`, `parish`, `village`, `membership_type`, `occupation`, `size_of_land`, `picture_url`, `bank_account_encrypted`, `registered_by_agent_id` (foreign key to `agents`), `phone_country_prefix`, `status` (enum, `farmer_status`), `created_at`, `updated_at`.
  - Note: the original SQLite schema had three overlapping identifier fields on this table (`farmer_id`, `key`, and `kb_farmer_id`). `kb_farmer_id` was dropped during migration as redundant — this should be confirmed as genuinely safe with Georgia if any external system was relying on it, but no such dependency was found in the codebase.
  - There is a **partial unique index** on `id_number_hash` (`WHERE id_number_hash IS NOT NULL`), meaning farmers without an ID number recorded (which happens with some real cooperative CSV imports that don't collect ID numbers) do not conflict with each other, but any two farmers that do have matching ID numbers will be caught as duplicates.

**`users`** — a single table covering all 7 roles, distinguished by the `role` column. Columns: `user_id` (UUID primary key), `phone_number` (unique — the login identifier for OTP-based roles, and used with a password for admin-tier roles), `name`, `role` (enum, `user_role`), `farmer_id` (nullable foreign key — only populated for farmer-role users, linking their login account to their farmer record), `district`, `region`, `aggregation_center` (used for scoping agent/admin visibility), `status`, `password_hash` (used for admin-tier password login, alongside OTP for farmer/agent), `created_at`, `updated_at`.

**`otp_codes`** — one-time password records for phone-based login. Columns: `id`, `phone_number`, `code`, `expires_at`, `used` (boolean), `created_at`.

**`agents`** — extends a `users` row (role = `agent`) with field-agent-specific data. Columns: `agent_id` (UUID primary key), `user_id` (unique foreign key to `users`), `government_id_encrypted` (AES-256-GCM encrypted, same format as farmers' ID encryption), `aggregation_center`, `region`, `district`, `status` (enum, `agent_status` — defaults to `pending_verification`, meaning agents themselves go through a vetting process before being trusted), `verified_by` (foreign key to `users`, the admin who verified them), `verified_at`, `created_at`.

### The task/compliance hierarchy — the actual spine of the product

```
sectors
  → programs
      → program_projects
          → tasks
          → program_project_farmers (which farmers are enrolled in this program_project)
          → farmer_tasks (a specific farmer's progress on a specific task)
```

**`sectors`** — the broadest categorization (e.g. "Conservation"). Columns: `id`, `name`, `description`, `country`, `created_at`, `updated_at`.

**`programs`** — sits within a sector (e.g. "Tree Planting" within "Conservation"). Columns: `id`, `sector_id` (foreign key), `name`, `description`, `status`, `budget_kes`, `created_at`, `updated_at`.

**`program_projects`** — a specific, time-bound instance of a program (e.g. "Tree Planting Project - Nairobi Q3 2026"). Columns: `id`, `program_id` (foreign key), `name`, `region`, `budget_kes`, `start_date`, `end_date`, `status`, `country_manager_id` (foreign key to `users`, the admin overseeing it), `total_tasks`, `completed_tasks`, `is_test` (boolean), `created_at`, `updated_at`.

**`tasks`** — a specific task within a program project (e.g. "Obtain Seedlings", "Plant Trees"). Columns: `id`, `program_project_id` (foreign key), `name`, `description`, `task_order` (integer, for sequencing), `payment_value_kes` (how much a farmer earns for completing this specific task), `assigned_agronomist_id` (foreign key to `users`), `due_date`, `created_at`, `updated_at`.

**`program_project_farmers`** — records which farmers are enrolled in a given program project. Columns: `id`, `program_project_id` (foreign key), `farmer_id` (foreign key), `status`, `created_at`. Has a unique constraint on `(program_project_id, farmer_id)` — a farmer cannot be enrolled twice in the same project.

**`farmer_tasks`** — this is the single most important table in the whole system. It tracks one specific farmer's progress on one specific task. Columns: `id`, `task_id` (foreign key), `farmer_id` (foreign key), `program_project_id` (foreign key), `status` (enum, `task_status`), `submitted_date`, `approved_date`, `completed_date`, `photo_evidence_url` (the farmer's uploaded proof of completing the task), `notes` (farmer's own notes on submission), `rejection_reason` (populated if an admin/agent rejects the submission, shown back to the farmer so they can understand what to fix and resubmit), `reviewed_by` (foreign key to `users` — which admin/agent actually approved or rejected it — this field was added during migration as an improvement over the original schema, which did not track who reviewed a submission), `created_at`, `updated_at`. Has a unique constraint on `(task_id, farmer_id)`.

**The full lifecycle this supports, confirmed working end-to-end during migration testing:**
1. Admin assigns tasks (via the sector → program → program_project → task hierarchy) to enrolled farmers
2. Farmer completes the task in real life, then submits photo evidence + notes via the mobile app (`status` becomes `submitted`, API-facing value `submitted-for-approval`)
3. An agent or admin reviews the submission. If rejected, `rejection_reason` is populated and `status` reverts so the farmer can resubmit with updated evidence/notes. If approved, `status` becomes `approved`.
4. **A Postgres trigger, `create_payment_on_task_approval`, automatically fires** whenever a `farmer_tasks` row's status changes to `approved`. This trigger inserts a new row into the `payments` table itself, using the task's `payment_value_kes` as the amount and the task's name as the description. **No backend application code manually creates payment rows for task completions** — this was deliberately verified across every relevant service (`hierarchyService.ts`, `bankingService.ts`) during migration specifically to avoid a double-payment bug, since it would be easy for a service to also try to insert a payment row for the same event, resulting in two payments for one approved task.
5. A banking agent sees the newly created payment (status `pending`) and processes it — this creates a `bank_transactions` row and, in a real (non-simulated) integration, would call out to Equity Bank's API.
6. A webhook callback from the bank (or, in dev/testing, a simulated equivalent) marks the payment as `transferred`, and the farmer sees the update reflected in their payment history.

### Payments and banking

**`payments`** — Columns: `id`, `farmer_id` (foreign key), `farmer_task_id` (foreign key to `farmer_tasks` — this replaces the original schema's `farmer_project_id`, since payments are now tied to individual task completions rather than whole legacy "projects"), `description` (replaces the original `project_name` free-text field — kept as a human-readable label, populated from the task name), `amount` (integer, in KES), `currency` (defaults to `KES`), `payment_method` (defaults to `M-Pesa`), `payment_status` (enum), `mpesa_reference`, `processed_by` (foreign key to `users` — the banking agent who processed it), `verification_status`, `created_at`, `paid_at`.

**`bank_transactions`** — records the actual attempt to move money via the banking partner. Columns: `id`, `payment_id` (foreign key), `farmer_id` (foreign key), `amount`, `currency`, `recipient_phone`, `status` (enum, `bank_transaction_status`), `equity_reference` (the reference ID returned by Equity Bank's API), `equity_response` (raw response data), `error_message`, `initiated_by` (foreign key to `users`), `webhook_received_at`, `created_at`, `completed_at`.
  - The presence of `equity_reference`/`equity_response` fields in the original codebase (found before any explicit discussion of a banking partner) was the concrete evidence that confirmed **Equity Bank** — a large, real, licensed bank operating across Kenya, Uganda, and other East African countries — is the actual, named banking integration partner for this project, not a hypothetical or undecided one. However, as of this migration, **only the dev-simulation code path has been tested** (`USE_EQUITY_H2H=false` triggers a fake, simulated response rather than calling Equity's real API). The real API integration remains completely unverified against reality — this requires real sandbox/production credentials from Equity Bank, which is a business/partnership task, not something further engineering work alone can resolve.

**`payment_verifications`** — Columns: `id`, `payment_id` (foreign key), `agent_user_id` (foreign key to `users`), `status`, `notes`, `verified_at`, `created_at`.

### Aggregation centres, inventory, and supporting tables

**`aggregation_centres`** — physical locations where produce/deliveries are received. Columns: `centre_id` (**TEXT**, not UUID — real centre IDs in the actual data are human-readable codes like `ke-kiambu-01`, `ug-gulu-02`, not random UUIDs; this required a specific schema fix during migration, described in Part 4), `name`, `country`, `location_level_1`, `location_level_2`, `region`, `status`, `manager_name`, `manager_phone`, `created_at`.

**`centre_inventory`** — records deliveries received at a centre. Columns: `id`, `centre_id` (foreign key, TEXT type matching `aggregation_centres`), `farmer_id` (foreign key), `task_id` (nullable foreign key), `product_name`, `quantity_received`, `unit` (defaults to `kg`), `quality_status` (enum), `quality_notes`, `received_date`, `scanned_by_user_id` (foreign key to `users`), `is_marketplace_ready` (boolean — a hook for a future buyer-marketplace phase that does not currently exist in this product), `marketplace_price_per_unit` (same future-phase hook), `created_at`. This table currently has no real data flowing through it — the aggregation centre / QC workflow exists structurally but has not been exercised with real deliveries yet.

**`locations`** — a hierarchical location reference table (country → region → district etc.). This table exists in the schema but is currently unused/unpopulated — farmers and agents instead use flat `district`/`region`/`sub_county`/`parish`/`village` text fields directly on their own records. This was a deliberate decision to keep things simple rather than force adoption of an unused hierarchy table, though it could be revisited if a more structured location system becomes necessary later.

**`import_sessions`** — tracks a CSV bulk-import operation. Columns: `id`, `status`, `total_rows`, `valid_rows`, `invalid_rows`, `duplicates`, `imported_count`, `data` (JSONB — this was TEXT in the original SQLite schema; JSONB is the correct Postgres equivalent for storing structured data), `errors` (JSONB), `created_at`, `completed_at`.

**`notifications`** — Columns: `id`, `user_id` (foreign key), `title`, `message`, `type`, `read` (boolean), `created_at`.

**`audit_logs`** — a record of significant actions taken across the system (logins, registrations, approvals, permission denials, payment processing, etc.). Columns: `id`, `user_id` (nullable foreign key), `user_role`, `action`, `category`, `resource_type`, `resource_id`, `details` (JSONB), `ip_address`, `success` (boolean), `created_at`. Confirmed during testing to be actively capturing real events across every domain of the system (auth, agent registration, payment processing, farmer data access, etc.) — 34 real audit entries were present after a day of testing every part of the migrated system.

---

## Part 4 — The backend conversion process: what actually had to change, and why

Converting the backend from SQLite to Postgres was not simply a matter of changing a connection string. This section explains why, and what was actually involved.

### The synchronous vs. asynchronous problem

The entire original backend was written using `better-sqlite3`, a library that accesses the database **synchronously** — every database call (`db.prepare(...).get()`, `.all()`, `.run()`) blocks and returns its result immediately, in the same line of code. Accessing Postgres from Node.js, by contrast, is inherently **asynchronous** — every query must be `await`-ed. This is not a stylistic difference; it reflects a real difference in how these two databases are accessed over their respective connection types (a local file vs. a networked database connection). This meant that every single function across the entire backend that touched the database — approximately 211 individual queries spread across 16 service files — needed to be rewritten to use `async`/`await`, and every route handler calling those functions needed to do the same.

Because of this, a "gradual swap" (keeping the database connection code updated while leaving services untouched) was explicitly not attempted — it would have required an unsafe synchronous wrapper around an inherently asynchronous database client, risking blocking Node's event loop under real load. Instead, the conversion was done as a full, deliberate, domain-by-domain replacement.

### SQL syntax differences that had to be fixed throughout

SQLite and Postgres are both relational databases and share a great deal of SQL syntax, but several specific things needed to change everywhere they appeared:

- `datetime('now')` (SQLite) → `NOW()` (Postgres)
- Positional `?` placeholders (SQLite) → numbered `$1`, `$2`, etc. (Postgres)
- `INSERT OR IGNORE` (SQLite) → `INSERT ... ON CONFLICT DO NOTHING` (Postgres)
- `COLLATE NOCASE` (used for case-insensitive text search/sorting in SQLite) → `ILIKE` (Postgres's native case-insensitive comparison)
- `PRAGMA foreign_keys`, `journal_mode = WAL`, and other SQLite-specific pragmas → not needed at all; Postgres enforces foreign keys and manages its own write-ahead logging internally
- `sqlite_master` (SQLite's internal table listing) → Postgres's `information_schema.tables` / `pg_catalog`, where relevant

### The order the conversion was actually done in, and why

The conversion was done **one domain at a time**, in this specific order, each one fully tested against the real Supabase database before moving to the next: **Auth → Users → Farmers → Agents → Banking → Hierarchy → Misc (audit/notifications/aggregation) → Bootstrap (seed/demo data scripts)**.

This order was chosen deliberately: Auth first because everything else depends on being able to log in at all; Bootstrap last because the seed/demo-data scripts are the most likely to cause real damage if converted carelessly (see below) and benefit from every other domain already being stable and understood.

Doing this one domain at a time, rather than attempting the whole 211-query conversion in a single pass, was a deliberate risk-management decision: if something broke, it was immediately clear which domain caused it, rather than needing to debug a change spanning the entire codebase at once.

### The Bootstrap domain required special care, not just conversion

The seed/bootstrap scripts (`seed.ts`, `ensureDemoFarmerPortal.ts`, `seedHierarchy.ts`) exist to populate demo/test data when the application starts up. Converting these to Postgres without first checking their behavior would have been genuinely risky: by the time this domain was reached, the Supabase database already contained real migrated data plus a day's worth of real test activity (real task submissions, approvals, payments). A careless conversion could have caused these scripts to try to re-seed demo data that already existed, potentially duplicating records or crashing on constraint violations. Before converting these scripts, an explicit analysis was done first, asking what would happen if the old (unconverted) logic ran against the real, populated database. This surfaced a genuine, real bug that would otherwise have caused duplicate hierarchy data on a server restart (`seedHierarchy.ts`'s condition for "should I create the full demo hierarchy" did not correctly check whether it had already been created) — this was fixed as part of the conversion, verified by comparing table row counts before and after a full server boot to confirm zero duplicates were introduced.

### Roles: bringing the code in line with the intended 7-role design

As described in Part 1, the actual running code only implemented 5 roles at the start of this migration. Bringing this up to the full intended 7-role design required changes across 15 files, not just the database schema:
- `shared/src/roles.ts` — the `UserRole` type expanded, and the `PERMISSIONS` map rewritten with new granular permission keys (e.g. `users.write.elevated`, `users.write.banking_agents`, `audit.read.financial`)
- New helper functions added: `isPlatformAdminRole`, `isSuperAdminRole`, `isRegionalAdminRole`, `isBankingAgentRole`, `isBankingAdminRole`, `isRegionScopedRole`, `canCreateUserRole`
- Every backend route file that checked specific role names (e.g. `requireRole('super_admin', 'admin', 'agent')`) was updated to correctly include the new `platform_admin` and `banking_admin` roles wherever appropriate
- The mobile app's own role-based navigation and permission-gating logic (`mobile/src/store/authStore.ts`, `mobile/src/constants/roles.ts`, `mobile/src/navigation/RootNavigator.tsx`, and admin-facing screens) was updated to match, since the mobile app does its own client-side role checks for navigation/UI purposes (though, critically, **all real enforcement happens server-side** — the mobile app's own checks are for UX only, not security)
- The legacy role value `banking` was renamed to `banking_agent` everywhere it appeared, with a database migration to update any existing rows, and a `normalizeRole()` function added so that any code still referencing the old value `banking` is automatically treated as `banking_agent`

The specific permission rules enforced, matching the intended design described in Part 1:
```
platform_admin  → can create any role, including super_admin and platform_admin
super_admin     → can create admin, agent, farmer — not elevated roles
banking_admin   → can create banking_agent only
everyone else   → cannot create user accounts at all
```
Regional scoping (`admin` and `agent` roles only seeing farmers/data in their assigned region or district) is enforced at the route/query level, not just via the permission map. Banking isolation (`banking_admin`/`banking_agent` having zero access to farmer/hierarchy/task data) is enforced by these roles simply having no matching permission entries for those data domains at all, rather than an explicit deny rule — they structurally cannot reach that data through the API.

### The `aggregation_centres.centre_id` type fix

The original schema design for this migration assumed `centre_id` should be a UUID, consistent with every other table's primary key style. However, the real, actual data (verified directly from the original SQLite export) uses human-readable text codes for centre IDs (e.g. `ke-kiambu-01`, `ug-mbarara-01`) — not random UUIDs. This required a specific fix after the initial schema was already created: since another table (`centre_inventory`) had a foreign key referencing `aggregation_centres.centre_id`, the two tables' matching columns could not simply be changed independently — Postgres does not allow changing a column's type while a foreign key constraint referencing it is still active. The fix required: (1) temporarily dropping the foreign key constraint, (2) changing both tables' `centre_id` columns to `TEXT`, (3) re-adding the foreign key constraint now that both sides matched.

---

## Part 5 — The legacy `projects` / `farmer_projects` tables: why they were retired, and why they were partially reconnected

The original SQLite schema had **two parallel systems** for tracking a farmer's involvement in agricultural programs:

1. A **legacy, flat system**: `projects` (a simple catalog of project names) and `farmer_projects` (which farmer is enrolled in which project, with a completion percentage and payment status directly on this table)
2. A **newer, more granular hierarchy**: `sectors → programs → program_projects → tasks → farmer_tasks`, which supports individual task-level tracking, photo evidence, rejection reasons, and the automatic payment-on-approval trigger

These two systems existed **side by side** in the original codebase — a genuine piece of technical debt, not an intentional design. The newer hierarchy was clearly the actual direction the product was moving in (it was explicitly labeled "Phase 2" in code comments), and the decision was made to build the new Postgres schema around the hierarchy system exclusively, not carrying the legacy `projects`/`farmer_projects` tables forward in their original form.

**However**, before making this change, a deliberate investigation was carried out (rather than assuming the legacy tables were safely unused) into exactly which parts of the live application still depended on them. This investigation found that **the legacy tables were still actively read by four real, live features**:
1. The farmer dashboard's "Active Projects" list and "Next Project" card
2. The admin farmer detail screen's project status rows
3. The admin dashboard's "Active Projects" count statistic
4. The CSV bulk-import process, which auto-enrolls newly imported farmers into projects based on "Project 1/2/3" columns in the spreadsheet

A decision was made to **not attempt both the schema retirement and the feature reconnection in the same piece of work**, specifically to reduce risk: rewriting a large, complex backend to use a new database is already a significant undertaking, and bundling in "also rewrite these four features to read from an entirely different table structure" at the same time would have made it much harder to isolate the cause if something went wrong. Instead:

1. The legacy tables were excluded from the new schema entirely
2. Every place in the code that read or wrote to these tables was updated to **fail safely** — returning empty results, zero counts, or no-op behavior — rather than throwing an error. This was explicitly verified: CSV import continues to succeed (just without enrolling farmers in the old-style project catalog), and the affected screens simply show empty/zero states rather than crashing.
3. **Once the core migration was confirmed stable**, all four features were then properly reconnected — this time pointing at the real hierarchy tables (`program_project_farmers` / `farmer_tasks`) instead of the retired ones. This included computing genuine task-completion progress (e.g. "2 of 5 tasks complete") rather than relying on the old schema's separate `completion_percentage` field.

### The CSV import project-name-matching problem, and how it was solved

Reconnecting CSV import's project enrollment step to the hierarchy tables introduced a new problem that did not exist with the old flat `projects` catalog: `program_projects` are richer records (with a region, budget, and date range) that were never originally designed to be created ad-hoc from a spreadsheet cell the way the old, simple `projects` catalog was. Additionally, real cooperative CSV files (verified directly from actual sample files provided during this project) contain significant real-world messiness — inconsistent capitalization, extra whitespace, and occasional typos in project names.

The solution implemented has two distinct layers:
1. **Normalization-based exact matching (automatic, silent)**: before comparing a CSV's project name against existing `program_projects`, both values are trimmed of whitespace, have repeated internal spaces collapsed to one, are lowercased, and have trailing punctuation stripped. If they match after this normalization, the farmer is enrolled in the existing project silently — no warning shown, since this is just ignoring formatting noise, not making a risky guess.
2. **Similarity-based typo detection (a warning, never an automatic action)**: for values that do not match after normalization, a similarity check (implemented using Levenshtein distance in Node.js, since the Postgres `pg_trgm` extension was not already enabled on this project's Supabase database) compares the CSV value against existing project names. If a close-but-not-exact match is found, this is surfaced as a **non-blocking warning** in the import validation results (e.g. "Row 5: project name 'Coffee Traning' is similar to existing project 'Coffee Training' (94% match) — check for a typo, or this will be created as a new project"). The import still succeeds regardless — this is a heads-up for a human to review, never an automatic merge, since guessing wrong here could silently attach a farmer to the wrong project.
   - The similarity threshold is **length-dependent**: names under 6 characters produce no warnings at all (too many false positives on short, genuinely different names like "Soil" vs "Coal"); names of 6–9 characters use a stricter 0.92 similarity threshold; names of 10 or more characters use a 0.85 threshold. This tiered approach was specifically chosen after recognizing that a single flat percentage threshold would misfire badly on short project names.
3. Any project name that doesn't match anything (after both layers) is created as a genuinely new `program_project`, but under a clearly-labeled sector ("CSV Import") and program ("Imported Projects") — deliberately kept visually separate from properly designed, deliberately-created programs, so that ad-hoc CSV-created projects don't get confused with intentional ones. Newly created projects this way start with zero tasks and do not appear as "active" on a farmer's dashboard until an admin actually adds tasks to them.

---

## Part 6 — Security fixes: encryption and duplicate detection

### The encryption problem, and why it existed

During the initial data migration from SQLite to Postgres, the farmer's ID number was stored in the new `id_number_encrypted` column as a **plaintext placeholder** — this was a known, deliberately temporary shortcut taken during the earliest stage of migration, explicitly flagged at the time as needing a real fix before production use. Separately, it was discovered that the *existing* agent record's `government_id_encrypted` field was not encrypted using the `.env` file's `ENCRYPTION_KEY` at all, but using a **hardcoded developer fallback key** (`kilimo-bridge-dev-encryption-key-32b!`) present in the encryption service's own code — this was a genuine, real inconsistency in the original codebase, not something introduced during migration, and it was only discovered because the key-rotation script (described below) initially failed to decrypt this specific record and had to be extended to try multiple possible historical keys.

### The duplicate-detection problem

Separately from the encryption issue, a real architectural problem was identified: because the encryption scheme used for `id_number_encrypted` includes a random initialization vector (IV) — meaning the exact same input ID number encrypts to a different-looking ciphertext every single time — two different farmer records containing the *same real ID number* would never produce matching encrypted values, meaning **duplicate detection based on comparing encrypted ID numbers can never work**, no matter how correctly the encryption itself is implemented. This was directly connected to an earlier observation, made while reviewing the live admin panel, of what appeared to be the same real farmer ("ABAK ROSE" and "abak rose") present as two separate records — this is very likely exactly this class of bug in action, not a one-off data entry mistake.

### The fix implemented

Two changes were made together, since they touch the same code path:

1. **Proper encryption**: `id_number_encrypted` now genuinely encrypts the farmer's real ID number using AES-256-GCM, in the same `enc:iv:tag:ciphertext` format already used (correctly) elsewhere in the codebase for agents' government IDs — applied consistently for both the CSV bulk-import path and manual farmer registration.
2. **A separate, deterministic hash column for duplicate detection**: a new column, `farmers.id_number_hash`, stores a **deterministic** HMAC-SHA256 hash of the normalized ID number — deterministic meaning the same input always produces the exact same hash output, unlike the randomized encryption. This hash is keyed using a **separate, dedicated secret** (`ID_NUMBER_HMAC_KEY`), deliberately *not* reusing `ENCRYPTION_KEY` — the reasoning being that encryption and this kind of "blind index" hashing serve different security purposes and should be able to be rotated independently of one another in the future. Duplicate-ID checks (both during CSV import and manual registration) now compare this hash column, not the encrypted field, and correctly catch duplicate ID numbers — verified directly by creating two farmer records with the same fake ID number and confirming the second one was rejected with an explicit "ID number already exists in system" error, both when calling the underlying function directly and when calling the real registration API endpoint.

### The key rotation

Because the `.env.example` template's placeholder values for `JWT_SECRET` and `ENCRYPTION_KEY` (literally the strings `change-this-in-production` and `change-this-32-char-encryption-key!`) had never actually been replaced with real, securely generated secrets, a proper rotation was carried out rather than accepting this as a "fix it later" item — specifically because at this early stage, the amount of real encrypted data affected was still very small (a handful of records), making this the easiest possible moment to do it properly. This was **not** done as a simple find-and-replace of the environment variable values, because doing so would have made all existing encrypted data permanently unreadable (the data was encrypted under the old key; changing the key without also re-encrypting the data would orphan it). Instead, a dedicated one-time migration script was written (`backend/scripts/rotate-encryption-keys.ts`) that:
1. Reads every farmer and agent record with encrypted fields
2. Decrypts each one using the *old* key (trying a documented list of historical fallback keys, to account for the discovered dev-fallback-key inconsistency described above)
3. Re-encrypts each one using a newly, securely generated key (`openssl rand -hex 32`)
4. Recomputes the `id_number_hash` for every farmer using a newly generated, dedicated HMAC key
5. Re-fetches every updated row afterward and verifies it can be correctly decrypted using the new key, before considering the migration complete

`JWT_SECRET` was rotated at the same time (a simple value swap, since no stored data is encrypted with it — it is only used to sign login session tokens; rotating it invalidates any currently active login sessions, which is expected and harmless).

**The real, current values for `ENCRYPTION_KEY`, `ID_NUMBER_HMAC_KEY`, and `JWT_SECRET` are stored only in the working `backend/.env` file on the correct branch (`feature/postgres-supabase-migration_james_work`) and in the Render deployment's environment variable settings. They are deliberately not repeated in this document.** Anyone setting up a new environment to work on this project needs to copy these exact values from an existing working setup (ask James or Georgia directly) — generating new ones without running an equivalent rotation/migration process would make existing encrypted farmer/agent data permanently unreadable.

---

## Part 7 — Deployment: the Render test environment

A separate, isolated Render web service was created specifically to test this migration live on the internet, deliberately kept completely separate from any existing production Render service, to avoid any risk of disrupting or overwriting an existing live deployment while this work was being tested.

**Configuration used:**
- **Root Directory**: `backend` (this repo is a monorepo containing both `backend/` and `mobile/` — without setting this, Render's default scripts try to install and run both the backend *and* the mobile/Expo app together, which is incorrect for a backend-only deployment and was the cause of an early failed deploy attempt)
- **Build Command**: `npm run build:render` (this specific script — not a plain `npm run build` — matters because Render sets `NODE_ENV=production` by default, which causes a plain `npm install` to skip devDependencies; since this backend's TypeScript build requires `tsc` and various `@types/*` packages that live in devDependencies, `build:render` explicitly runs `npm install --include=dev` before compiling, and also verifies that the `shared/` folder — which the backend imports validation and role logic from — is present, since the whole monorepo needs to be cloned, not just a backend-only export)
- **Start Command**: `npm start` (equivalent to running `node dist/backend/src/index.js` — the compiled output)
- **Branch deployed**: `feature/postgres-supabase-migration_james_work` — not `main`
- **Environment variables required**: `DATABASE_URL` (the Supabase pooler connection string), `JWT_SECRET`, `ENCRYPTION_KEY`, `ID_NUMBER_HMAC_KEY` (all matching exactly the values already in use locally — see Part 6 for why these must match exactly, not be freshly generated), `NODE_ENV=production`, `USE_EQUITY_H2H=false` (kept in the safe, dev-simulated banking mode), `PILOT_OTP=true` (allows testing OTP login without needing a real SMS provider configured)

This deployment was confirmed genuinely working — not just "builds successfully" but actually functioning — by hitting its real public `/health` endpoint over the internet and confirming it returned correct live counts matching the real Supabase data (`farmers: 3`, and after a further fix, `hierarchy_projects` and `demo_farmer_tasks` counts as well, which had initially been hardcoded placeholder `null` values in the health-check code rather than genuinely wired up to real queries — this was identified and fixed during testing).

The actual mobile/web application frontend was also confirmed working against this live Render deployment (via `npx expo start --web`, which runs the exact same application code in a browser rather than requiring a physical device) — logging in as the demo farmer and confirming the dashboard correctly displayed real data pulled through the full chain: Supabase → Render-hosted Express API → the actual app UI.

### A known limitation: real device testing via Expo Go

This project uses **Expo SDK 57**. The standard Expo Go app, downloadable from the Apple App Store, was found to only support SDK 54 at the time of this work (Expo's own SDK 57 changelog confirms newer SDK support in the App Store's Expo Go build was still pending Apple's approval at the time). This means a real physical iPhone running the standard App Store version of Expo Go **cannot** currently run this project — attempting to do so produces an explicit "Project is incompatible with this version of Expo Go" error. This is not related to anything about the Supabase migration — it is a pre-existing characteristic of the project's Expo SDK version. Testing on a real device currently requires either an iOS Simulator with a compatible Expo Go build installed via the Expo CLI, Android emulator/device via the CLI, a custom development build (`eas go`, requiring an Apple Developer account), or simply using the `--web` browser-based testing mode as described above. This is a genuine, real gap worth addressing before any real end-user testing on physical phones is needed, separate from anything related to the database migration itself.

---

## Part 8 — Why Row-Level Security (RLS) is currently disabled, and why this is safe

Early in this migration, it was an open question whether Supabase's Row-Level Security needed to be built out in full before this migration could be considered complete. This was resolved by directly investigating the actual backend code (via Cursor reading the real source files), which confirmed conclusively that:

- The mobile app **never connects to Supabase directly** — it only ever communicates with the Express API, using the environment variable `EXPO_PUBLIC_API_URL` (defaulting to a local address, and reconfigured to point at the live Render deployment for testing, as described in Part 7)
- All authentication happens via the Express backend issuing and verifying JWTs (`backend/src/services/authService.ts`, `backend/src/middleware/auth.ts`)
- All permission enforcement happens via Express middleware (`authenticate`, `requireRole(...)`, `requirePermission(...)`), checked against the `PERMISSIONS` map in `shared/src/roles.ts`, on every single route, before any database query is executed
- Additional manual data-scoping (e.g. an agent only seeing farmers in their own district) is enforced explicitly in route handler code, not left to the database layer

Given this, **RLS is not the primary security boundary for this application — Express is.** Enabling RLS is not required for the application to be secure as currently architected, and was deliberately left disabled throughout this migration to avoid the risk of incomplete or incorrectly-configured RLS policies accidentally blocking legitimate access (since Supabase's default behavior, once RLS is enabled on a table, is to deny *all* access until explicit policies are added) at a time when the priority was proving the core migration worked correctly end-to-end.

**RLS remains a genuinely worthwhile future addition**, specifically as a second, independent layer of defense — protecting against the possibility of a bug in Express's own permission-checking code (e.g. a route accidentally missing a `requireRole()` check), or against the possibility of some future tool or script connecting to Supabase directly, bypassing the Express API entirely (for reporting, data export, or an admin tool, for example). This is tracked as outstanding, non-urgent work.

---

## Part 9 — A specific incident worth understanding: the parallel branch confusion

During this migration, a **separate, independently created branch** — auto-named `cursor/app-supabase-build-dbb0` by what appears to have been a Cursor cloud/background agent session — was found to exist, apparently representing an uncoordinated, separate attempt (by Georgia, or someone working with her, referred to as "Jay" in a message, whose identity in this context was not fully clarified) to connect this same project to the same live Supabase database, independently of and without knowledge of the work already completed on `feature/postgres-supabase-migration_james_work`.

This was caught **before** any environment variables were actually entered or any code from that branch was run against the real database — meaning no actual damage occurred. However, this incident is worth understanding clearly, because the risk was genuinely serious, not merely a matter of wasted duplicate effort: if that branch's own, independently written database-setup or migration code had been run against the same live Supabase project, there was a real risk it could have altered table structures, conflicted with the already-built role/schema design, or otherwise corrupted or duplicated the carefully built and tested database — not merely added some harmless extra rows.

**The resolution**: Georgia was walked through, step by step, switching her own local environment from the incorrect/independent branch to the correct, verified branch (`feature/postgres-supabase-migration_james_work`), confirmed via screenshot showing the correct branch checked out (indicated by the asterisk next to the branch name in `git branch` output). She was then guided through creating her own local `.env` files and was warned explicitly not to generate her own fresh secret values, but to use the exact same real values already in use (see Part 6 for why this matters).

**The lesson embedded in this document's existence**: this entire document was created specifically to prevent a repeat of this kind of incident — ensuring that anyone (a person, or an AI assistant they're working with) has full context on the *already completed and verified* state of this migration before considering any independent database or schema work, and knows explicitly which branch is the correct one to build on.

---

## Part 10 — Outstanding, deliberately deferred work

| Item | Status | Notes |
|---|---|---|
| Farmer dashboard reconnected to hierarchy tables | Done | See Part 5 |
| Admin farmer detail screen reconnected | Done | See Part 5 |
| Admin dashboard "Active Projects" stat reconnected | Done | See Part 5 |
| CSV import project enrollment reconnected | Done | Includes normalization + typo-warning logic, see Part 5 |
| Duplicate ID detection via hash | Done | See Part 6 |
| Encryption properly applied (not plaintext placeholder) | Done | See Part 6 |
| Encryption/HMAC/JWT secrets properly rotated | Done | See Part 6 |
| SQLite infrastructure fully removed | Done | `better-sqlite3` dependency, backup/restore scripts, and related documentation all removed and updated |
| Health check endpoint showing real hierarchy/task counts | Done | Previously hardcoded `null` placeholders |
| Equity Bank real API integration | Not done | Only the dev-simulation path has ever been tested. Requires real sandbox/production credentials from Equity Bank — a business/partnership task, not purely engineering |
| Row-level security (RLS) | Deliberately deferred | See Part 8 for full reasoning on why this is currently safe to defer |
| Real physical device testing via standard Expo Go | Blocked | SDK version mismatch, see Part 7 |
| App Store / Play Store submission readiness | Not started | Missing `eas.json`, bundle identifier/package name, native project folders; app still internally named "mobile" rather than "Kilimo Bridge" |
| Merge of `feature/postgres-supabase-migration_james_work` into `main` | Status should be checked directly on GitHub, not assumed | See Part 11 |

---

## Part 11 — Working practices going forward

### Branch status

All work described in this document was done on **`feature/postgres-supabase-migration_james_work`**, branched originally from `main`. **`main` has not been modified throughout any of this work.** Whether a pull request merging this branch into `main` has been opened or completed should be checked directly on GitHub rather than assumed by anyone reading this document later — if it has not yet been merged, continue working directly on `feature/postgres-supabase-migration_james_work`.

**The separate branch `cursor/app-supabase-build-dbb0` should not be used or merged** — see Part 9 for the full reasoning why.

### Daily routine for anyone working on this project

Before starting work each session:
```bash
cd kilimo-bridge-mobile
git checkout feature/postgres-supabase-migration_james_work
git pull origin feature/postgres-supabase-migration_james_work
```

After making any changes:
```bash
git add .
git commit -m "describe what changed"
git push origin feature/postgres-supabase-migration_james_work
```

Changes made by one person do not automatically appear for anyone else — they must be explicitly committed and pushed by the person who made them, and explicitly pulled down by anyone else before they'll see those changes locally.

### Coordination when working with more than one person

Since more than one person may now be working against the same live Supabase database and the same branch, **communicate before making any database schema changes** (creating or altering tables, changing enum values, running migrations) to avoid two people making conflicting changes to the live database at the same time. This is a practical, low-effort precaution (a quick message saying "about to change the database schema, hold off for a few minutes") rather than anything requiring special tooling.

### Environment setup for anyone new to this project

Both `backend/.env` and `mobile/.env` are private, local-only files (not committed to GitHub, per standard practice and the project's `.gitignore` configuration). Anyone setting up this project on a new machine needs to:
1. Copy `backend/.env.example` to `backend/.env`, and `mobile/.env.example` to `mobile/.env`
2. Fill in the real, current values for `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `ID_NUMBER_HMAC_KEY` — copied exactly from an existing, already-working setup (ask James or Georgia directly for these) — **not freshly generated**, per the detailed reasoning in Part 6
3. Other values in `.env.example` (e.g. `PILOT_OTP=true`, `USE_EQUITY_H2H=false`, `NODE_ENV=development`) can generally be left as their example defaults for local development

---

## Part 12 — Architecture, summarized

```
  FARMER          FIELD AGENT       BANKING AGENT              ADMIN / SUPER ADMIN /
 (mobile app)      (mobile app)      (mobile app)          PLATFORM ADMIN / BANKING ADMIN
                                                                (same app, web, role-gated)
     |                  |                  |                            |
     +------------------+------------------+----------------------------+
                                       |
                              Express API (Node.js)
                    JWT authentication + role/permission middleware
                  (this is where ALL real security enforcement happens —
                       see Part 8 for why RLS is currently unnecessary)
                                       |
                                       v
                        PostgreSQL, hosted on Supabase
                      (London region, transaction pooler)
                    Row-level security currently DISABLED
                                       |
                          +------------+-------------+
                          |                          |
                   Equity Bank API           (future: document/file
              (dev-simulation tested only;    storage — not yet built)
               real API integration
                   still untested)
```

The mobile app communicates **only** with the Express API — it never connects to Supabase directly. An offline-first local storage layer (using SQLite purely as an on-device cache for the mobile app, syncing to the real Postgres/Supabase backend when connectivity is available) has been discussed as a likely future need for farmers and field agents working in low-connectivity rural areas, but **has not been built** — the mobile app currently requires an active internet connection to function at all.

---

## Part 13 — The Lovable admin panel: connecting a second tool to the same database

The day after the Postgres migration described above, a second front-end was brought into the picture: an admin web panel that Georgia had already built the UI for using Lovable (an AI-assisted web app builder). This section documents how that panel went from disconnected/prototype to properly connected to the real production database, and — critically — what that means for anyone now working across both Cursor (mobile/backend) and Lovable (admin web panel) simultaneously.

### The starting situation

Georgia's admin panel had been built against **Lovable Cloud** — Lovable's own auto-provisioned, Lovable-managed Supabase instance. This is a completely separate database from the real Kilimo Bridge Supabase project described in Parts 1–12 of this document. Lovable Cloud projects are not accessible via a normal Supabase account — no dashboard access, no service role key, no direct connection string. They exist purely inside Lovable's own management layer.

### Why the two databases could not simply be merged

Before making any changes, Lovable Cloud's database was exported (`.backup` file, a PostgreSQL custom-format dump) and inspected directly (using `pg_restore`/`strings` to extract the schema, since the dump's format version was newer than locally available tooling could fully restore). This inspection found a real, reasonably developed prototype schema — 20 tables, 52 RLS policies, a simple 3-role system (`admin`, `field_agent`, `viewer`) — but one that **did not match the real production schema** in almost any respect: different table names (`profiles`/`user_roles`/`deliveries`/`projects` vs. our `users`/`farmers`/`centre_inventory`/`program_projects`), different column names, no encryption on sensitive fields, no payments/banking tables at all, and a simpler, incompatible task hierarchy.

The decision made: **do not import Lovable Cloud's schema into the real database.** Doing so would have recreated exactly the "two parallel, competing systems" problem that Parts 5 and 6 of this document describe being deliberately resolved during the original migration (the old `projects`/`farmer_projects` tables vs. the hierarchy system). Instead, the real production schema was treated as the sole source of truth, and Lovable's admin panel was rebuilt to work against it.

### The actual reconnection process

1. **Lovable Cloud was removed** from the project (via Lovable's official July 2026 "Cloud → Overview → Advanced settings → Remove Lovable Cloud" feature — this exit path did not exist reliably before that date; earlier versions of Lovable required a much messier manual migration process).
2. **The Lovable project was connected directly to the real Supabase project** (ref `tzaipijebibisgkwrdnz`, London region — the same project described throughout this document), via Lovable's "Already have a Supabase project? Connect it here" flow, requiring Supabase account authorization.
3. This connection step required **Owner-level access within the Lovable workspace** — a project-level "Admin" collaborator role (which is what the person doing this work initially held, having been invited to the specific project rather than the workspace) was not sufficient. Georgia (the actual workspace Owner) had to either perform this specific action herself, or promote the collaborator to full workspace membership with Owner rights, which is what was ultimately done.
4. Once connected, all 235 resulting TypeScript build errors (from components referencing tables/columns that only existed in the old Lovable Cloud schema) were fixed by **rewriting every affected component to use the real schema's actual tables and column names** — deliberately choosing not to add any new tables to the real database to make the old components "just work." Real field-name differences handled this way included `farmers.phone_number` (not `phone`), the `farmer_status` enum (not a boolean `is_deleted` soft-delete flag), and so on.

### Features that were cut or reduced as a direct result of this schema-alignment decision

Because the real schema has no equivalent columns/tables for some things the old Lovable Cloud prototype had, several features were deliberately cut or reduced rather than faked:
- GPS capture and an email field in the farmer registration wizard (no matching columns in `farmers`)
- Occupation and membership-type "cascading picker" dropdowns became plain free-text fields (the real schema stores these as free text, not as foreign keys to catalogue tables)
- The 30-second registration-wizard autosave now uses browser `localStorage` only (there is no `farmer_drafts` table in the real schema)
- The Quality Check modal on deliveries lost its price-adjustment slider and a `downgraded` status option (the real `quality_status` enum only supports `pending`/`passed`/`failed`)
- A "Partners" page, and catalogue browse pages for Products/Project Types/Occupations/Membership Fee Categories, now render as empty-state placeholders, since no backing tables exist in the real schema for any of these
- "Apply template" on the Tasks screen was removed (no `task_templates` table)
- There is no dashboard/landing page in the rebuilt admin panel at all — the root route simply redirects to the Farmers list

None of this data or functionality is lost forever — it simply doesn't exist as real, structured data in the production database yet. If any of these are wanted later, they would need to be deliberately designed and added as proper schema changes (with the same care given to every other schema decision in this document), not silently reintroduced.

---

## Part 14 — Row-Level Security: from "deliberately off" to "properly enabled"

Part 8 of this document explains, at length, why RLS was deliberately left disabled during the original migration — because the mobile app only ever talks to Supabase through the Express backend, which does its own complete, tested permission enforcement in application code, making RLS an optional defense-in-depth layer rather than a functional requirement.

**Connecting Lovable's admin panel changed this calculus, and RLS was enabled as a result.** The reasoning: a Lovable-built web app typically queries Supabase directly from the browser, using the public "anon" API key — a key visible to anyone who opens their browser's developer tools. With RLS off, this means every table's data (farmer names, districts, phone numbers, payment records, everything) was genuinely readable and writable by anyone who could see this web app's network requests, completely bypassing whatever login screen the UI displayed. This was verified directly and empirically: before enabling RLS, the anon key returned every row of `farmers`, `payments`, and `users`; after enabling RLS, the same anon key received `permission denied` on all of them.

### What was actually built

39 RLS policies were written and applied, covering all 19 public tables, built around the real 7-role system already established in Part 4 of this document (`farmer`, `agent`, `banking_agent`, `admin`, `super_admin`, `platform_admin`, `banking_admin`). Key design decisions:
- **District-based scoping** for `admin` and `agent` roles, deliberately matching the exact scoping logic already used in the Express backend (`isAgentRole(req.user.role) && req.user.district`), so the two independently-enforced systems (Express for the mobile app, RLS for the Lovable admin panel) apply the same real-world rule rather than two different, potentially inconsistent ones.
- One structural limitation was found and accepted rather than immediately fixed: `program_projects` has a `region` column but no `district` column, so project-level read/write policies for the `admin` role are scoped by region, not district, for that one table specifically. This is a known, documented inconsistency — worth resolving with a proper migration (adding a `district` column) if project-level district scoping is ever specifically required, but not blocking anything today.
- `banking_admin` and `banking_agent` roles have policies that grant them **zero access at all** to farmer, task, or hierarchy tables — enforced structurally (no matching policy exists granting them access), not just as an application-level convention.
- 10 remaining Supabase linter warnings, after the RLS pass, relate to `SECURITY DEFINER` helper functions used by the policies themselves (an accepted, standard pattern — each helper only ever returns information about the calling user's own role/district/farmer_id, so it cannot leak anything) plus one informational note about `otp_codes` having RLS enabled with deliberately zero policies (correctly making it service-role-only, since OTP codes are exclusively an Express/mobile-app concern).

### A critical fact discovered while investigating this: Express bypasses RLS entirely, and always has

This was explicitly tested and confirmed, not assumed: the Express backend's database connection (via `DATABASE_URL`) connects as the `postgres` role, which has `rolbypassrls = true` — meaning **Postgres row-level security has never applied to anything Express does**, both before and after this RLS work, regardless of how many policies exist. All 19 tables are owned by this same `postgres` role and do not have `FORCE ROW LEVEL SECURITY` set, which is the second, independent reason ownership alone would bypass RLS even without the explicit bypass flag.

**The practical implication: RLS policies only ever constrain Lovable's admin panel and any other client connecting via Supabase's public API layer (PostgREST) — they do nothing at all for the Express backend or the mobile app.** Express must continue to enforce all of its own permission/scoping logic in application code exactly as it always has; RLS is not now, and was never going to become, a safety net for that side of the system. This is a sound, standard two-gatekeeper architecture (Express enforces its own rules for its own clients; Supabase/RLS enforces its own rules for anyone connecting directly) — but it is important that anyone working on this project understands the two systems are genuinely independent, not layered on top of one another.

---

## Part 15 — A real security bug found by testing write access, not just read access

After RLS was enabled, a deliberate test was carried out to verify not just that read access was correctly restricted, but that **write access still worked correctly for every role** — since read-only verification alone would not have caught the following.

Testing an approval as the district-scoped Kiambu test admin (rather than as `platform_admin`, which had already been tested and passed) surfaced a genuine defect: the approval itself succeeded, but the automatic payment-creation trigger (`create_payment_on_task_approval()`, described in Part 3) failed with a `42501` permission-denied error. The root cause: this trigger function was not marked `SECURITY DEFINER`, meaning it executed with the *approving user's own* database permissions rather than its own independent authority — and a regional admin does not have direct write permission on the `payments` table under the new RLS policies (only `banking`/`platform`-tier roles do). The trigger's own automatic insert into `payments` was therefore being blocked by the very policies meant to protect that table from direct user access.

**The practical consequence, had this not been caught:** any regional admin or field agent approving a farmer's task through the (eventually built) admin interface would have had the approval itself succeed, but the farmer's payment would silently fail to be created — breaking the core payment loop for the majority of real-world approvers, while working perfectly for `platform_admin` (the role most likely to have been used for any quick initial testing, which is exactly why this could easily have gone unnoticed).

**The fix**: the function was altered to `SECURITY DEFINER` (with an explicitly pinned `search_path`, standard practice to prevent a class of privilege-escalation attack this modifier can otherwise introduce), which makes it always execute with its own defining permissions regardless of who triggers it. The fix was verified by re-running the exact same Kiambu-admin approval test, confirming the payment was now correctly created, then rolling back both the test task-status change and the resulting test payment so no fake data was left behind.

This episode is a useful, concrete illustration of why this document repeatedly emphasizes testing real write paths with real role impersonation, not just trusting that a policy which "looks correct" on paper will behave correctly for every role in practice.

---

## Part 16 — Admin accounts bridged into Supabase Auth

Enabling RLS meant that Supabase's own authentication system (`auth.users`) needed to actually recognize real people before granting any access at all — previously irrelevant, since RLS wasn't enforced. However, the project's real admin-tier accounts exist only in the application's own `public.users` table, using the application's own password-hashing scheme (see Part 4/Auth domain) — not in Supabase's separate, built-in authentication system.

Three accounts were created directly in Supabase Auth, each with a `user_id` matching the existing corresponding row in `public.users`, so that RLS policies (which key off `auth.uid()`) resolve correctly:
- **Platform Admin** — real email, matching the existing `platform_admin`-role account
- **Super Admin** — Georgia's real email, matching the existing `super_admin`-role account
- **A test region admin** (`district = 'Kiambu'`, `region = 'Central'`, matching the existing Kiambu field agent's region) — created specifically and solely to allow genuine end-to-end verification that the district-scoped RLS policies work correctly, since all three of the real database's migrated demo farmers happen to be located in Kiambu/Limuru, making this a meaningful real test rather than an empty one

**Deliberately not bridged into Supabase Auth**: `farmer`, `agent`, and `banking_agent` role accounts, since these roles only ever interact with the system via the mobile app (through Express, which — per Part 14 — is unaffected by Supabase Auth or RLS entirely) and have no reason to need a Supabase-native login at all.

**Deliberately not yet created**: a `banking_admin` account, since no real person had been identified for that role at the time this work was done. Creating one follows the identical process whenever a real person is assigned to it.

**Known outstanding item**: password-reset emails for these accounts hit Supabase's built-in email service's hourly rate limit partway through, and this was deliberately left unresolved/parked rather than worked around — meaning as of this writing, nobody has yet actually logged into the rebuilt admin panel through the browser and visually confirmed it works end-to-end. Everything described in Parts 13–15 was verified through direct, server-side role-impersonation testing (executing queries as if authenticated as each specific role), which is a genuine and rigorous form of verification, but is not the same as an actual human clicking through the real login flow and real UI.

---

## Part 17 — Feature-parity audit against Georgia's original working prototype

Once the rebuild was functionally stable, a deliberate, complete audit was carried out comparing every screen/feature that existed in Georgia's original Lovable Cloud prototype against its current status in the reconnected admin panel — specifically to avoid a situation where features were silently lost without anyone having a clear, complete picture of what changed. The full results:

**Fully working against real, production data**: Auth/login, Farmers list, Create Farmer wizard, Projects, Tasks, Approvals, Users (list/role management across all 7 roles), read-only catalogue browsing (Sectors/Membership groups/Aggregation centres), and the payment auto-generation trigger (verified end-to-end, including the regional-admin bug fix from Part 15).

**Working but reduced**: the specific reductions are listed in full in Part 13 above (GPS/email/cascading pickers cut from the registration wizard; Quality Check modal simplified; Aggregation Centre screens render correctly but show nothing since `centre_inventory` currently has 0 real rows; Settings screen has only account email + a display toggle, no organizational/notification/security settings).

**Cut entirely, showing an honest empty-state placeholder rather than fake data**: Partners page; catalogue browse pages for Products, Project Types, Occupations, and Membership Fee Categories.

**Data exists in the real database, but no admin-panel screen exists for it yet** (identified as the most significant real gaps, in priority order):
1. **Payments** — the auto-payment trigger was creating real rows, but there was no screen anywhere to view or act on them. *(Resolved — see below.)*
2. **Agent management/verification** — no way to move an agent from `pending_verification` to `active` status through the admin panel. *(Resolved — see below.)*
3. Bank transactions / payment verifications — still no dedicated screens; deliberately deferred, not forgotten, since these overlap with an open product question about whether `banking_admin`/`banking_agent` should have any web-panel presence at all, given they already have a fully working, tested experience on the mobile app (see Part 7 for the mobile banking screens). This needs a deliberate product decision, not just a build.
4. Audit trail viewer, notification centre, and bulk CSV import screens — also identified as missing, also deliberately deferred. Note that bulk CSV import already exists and is fully functional through the Express/mobile-admin side (see Part 5's discussion of CSV import project-matching) — its absence from the Lovable panel specifically is a possible future addition, not evidence of a missing capability in the system as a whole.

**Resolved during this same session**: two new screens were built to close the two highest-priority gaps identified above — a **Payments** screen (all payment rows, filterable by status, with summary totals, read-only since RLS correctly restricts direct payment writes to banking/platform-tier roles) and an **Agents** screen (lists all agents with their verification status; a "Verify" action, restricted in the UI to `platform_admin`/`super_admin` to match the underlying `agents_write` RLS policy, moves an agent from `pending_verification` to `active`).

---

## Part 18 — Working across two AI-assisted tools on one live database: what this means going forward

With Cursor (used for the mobile app and Express backend) and Lovable (used for the admin web panel) both now capable of independently reading from and writing to the same live, real Supabase database, a few practical realities are worth being explicit about for anyone continuing this work.

### The two tools track their own changes completely separately

Lovable writes every schema change (new columns, constraints, RLS policies, etc.) as a proper, timestamped, versioned `.sql` migration file inside `supabase/migrations/` in the project's own repository — genuinely equivalent in spirit to the deliberate, careful schema work described throughout this document. These files are part of the git history and are diffable, meaning there is a real, permanent record of every structural change Lovable has made.

However, this migrations folder has real, honest limits, worth understanding precisely:
- **It only records structural changes**, not data changes. Row inserts, updates, and deletes (seeding data, test cleanup, creating individual user rows) leave no file record at all — this is normal and expected (nobody wants a migration file for every row insert), but it does mean there is no permanent record of exactly what test/demo data has been created or modified over time, beyond what's captured in conversation records like this one.
- **It only captures changes made through Lovable specifically.** Any schema change made directly by Cursor, or manually through Supabase's own SQL editor, will not appear in this folder at all — meaning this migrations folder is a history of "what Lovable did," not a complete, unified history of everything that has ever happened to the database.
- **Auth-side actions are not captured either** — creating the three Supabase Auth accounts described in Part 16 went through Supabase's Admin API directly, with no corresponding SQL migration file.

### The practical takeaway

Because neither tool's own record-keeping sees the other's changes, **this document (`SUPABASE_MIGRATION_CONTEXT.md`) is the one place intended to hold the combined, true picture of the database's real history and current state** — it should be updated whenever either tool makes a meaningful structural change, and should be the first thing read into context at the start of any new working session with either tool, specifically to avoid the kind of uncoordinated, parallel-effort risk described in Part 9 (the earlier incident with a separate, independently-created branch attempting its own database migration without knowledge of work already done).

### A working practice worth following, established during this session

- **Structural changes** (new/renamed/dropped columns, changed enum values, new constraints, RLS policy changes) should be announced to whoever else is actively working on the project before being made, the same discipline already established for Cursor-side schema work in Part 11.
- **Data changes** (normal application usage — creating real records, updating statuses) do not need this same coordination; they are the normal, expected activity of the system working correctly.
- Periodically, it is worth asking either tool to pull the live schema fresh and compare it against what is documented here, to catch any undocumented drift before it causes a confusing, hard-to-diagnose bug days or weeks later.

### RLS bypass is a fact worth remembering, not a decision that needs revisiting

As established in Part 14: Express permanently bypasses RLS by virtue of its connection role, and this is the correct, intended architecture — not a gap to be closed. Anyone tempted to "fix" this by forcing RLS onto Express's connection, or switching Express to a restricted role subject to RLS, should understand this would mean re-implementing the same permission/scoping logic twice, in two different systems, which is a net increase in risk and maintenance burden, not a safety improvement. The two systems (Express's own application-level enforcement; Supabase RLS for anything connecting directly, like Lovable) are intentionally, soundly independent.

---

## Part 19 — Updated outstanding work list

In addition to the outstanding items listed in Part 10, the following are open as of this update:

| Item | Status | Notes |
|---|---|---|
| Actual human login test of the rebuilt Lovable admin panel | Not yet done | Blocked on Supabase's password-reset email rate limit clearing; everything else has been verified via direct role-impersonation testing, which is rigorous but not the same as a real click-through |
| `banking_admin`/`banking_agent` presence in the web admin panel | Undecided | These roles already have a fully working, tested mobile app experience (Part 7); needs a deliberate product decision on whether web access is also required, not just a build |
| Dashboard/landing page for the admin panel | Not built | Currently the root route simply redirects to the Farmers list |
| Bulk CSV import screen within the Lovable admin panel specifically | Not built | Already exists and works through the Express/mobile-admin side; a possible future addition to the web panel, not a missing system capability |
| Audit trail viewer / notification centre screens in the admin panel | Not built | Data exists (`audit_logs`, `notifications` tables have real rows); no UI yet |
| `program_projects` district vs. region scoping inconsistency | Known, accepted | This table has a `region` column but no `district` column, so `admin`-role RLS policies for it use region scoping while every other district-scoped table uses district; would need a schema migration to fully align, not currently blocking anything |
| Identity verification via a third-party KYC aggregator (e.g. Smile ID) | Under discussion, not yet decided or built | Proposed as a first-pass automated check (matching a farmer's ID number/name against government records) to run alongside, not replace, the existing in-person field-agent verification step. Open questions before proceeding: actual per-verification pricing at real farmer-count scale, confirmation of Uganda coverage quality (not just Kenya), whether "Basic KYC" (name/DOB match) or full "Biometric KYC" (live selfie match) is actually needed, and a formal data processing agreement given real farmer national ID numbers would be sent to a third party |

