# Kilimo Bridge App — NEW Supabase Build

## Safety rules (read first)

| Rule | Detail |
|------|--------|
| **Separate database** | App uses a **NEW** Supabase project — not the admin/Loveable platform |
| **Env prefix** | `APP_SUPABASE_*` / `EXPO_PUBLIC_APP_SUPABASE_*` only |
| **Do not touch** | Old admin Supabase URLs, admin portal code, Loveable migration |
| **Express API** | Still used for M-Pesa, OTP pilot, banking webhooks until fully on Supabase Auth |

---

## 1. Create NEW Supabase project

1. Supabase → **New project** (e.g. `kilimo-bridge-app`)
2. SQL Editor → run `supabase/app/migrations/001_kilimo_app_schema.sql`
3. Settings → API → copy **Project URL** and **anon** key
4. Settings → API → JWT secret = same as Render `JWT_SECRET` (for Kilimo OTP JWT + RLS)
5. **Do not** paste these into the admin platform env

---

## 2. Environment variables

### Mobile / EAS builds (Farmer + Agent + Banking apps)

```bash
EXPO_PUBLIC_API_URL=https://kilimo-bridge-mobile.onrender.com/api
EXPO_PUBLIC_APP_SUPABASE_URL=https://tzaipijebibisgkwrdnz.supabase.co
EXPO_PUBLIC_APP_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_SYNC_MODE=hybrid
```

### Backend migration only (service role — never in mobile)

```bash
APP_SUPABASE_URL=https://tzaipijebibisgkwrdnz.supabase.co
APP_SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Never set admin Supabase credentials in the mobile app.**

---

## 3. Migrate SQLite → NEW App Supabase

From Mac with full `kilimo.db`:

```bash
cd backend
npm run migrate:app-supabase
```

Report: `backend/data/app-migration-report.json`

---

## 4. Architecture

```
Farmer / Agent / Banking (Android/iOS)
  ├─ Online → NEW App Supabase (source of truth)
  ├─ Offline → expo-sqlite cache + sync_queue
  └─ SyncManager → push/pull on reconnect

Express API (Render) — OTP, banking, legacy admin routes
Admin platform — OLD Supabase / Loveable (untouched)
```

---

## 5. Phase 1 task status (76 tasks)

| Phase | Scope | Status |
|-------|--------|--------|
| **1A** | Farmer registration & profile | 🟡 Scaffold — profile read-only UI, `activated` field in schema |
| **1B** | Farmer projects/tasks/payments | 🟡 Existing screens + App Supabase repositories |
| **1C** | Field agent | 🟡 Agent screens exist; offline sync wired |
| **1D** | Banking | 🟡 Banking screens exist; PaymentRepository scaffold |
| **1E** | DB & sync | ✅ App schema, SyncManager, repositories |
| **1F** | Errors & logging | 🟡 Sync banner, audit_events table |
| **1G** | Security | ✅ RLS on app schema |
| **1H** | QA | ⬜ Device testing checklist in brief |
| **1I** | Bug fixes | ⬜ Per brief items 46–50 |
| **1J** | Admin portal | ❌ Out of scope |

Legend: ✅ done · 🟡 partial · ⬜ not started · ❌ excluded

---

## 6. Repositories (mobile)

| Repository | Tables |
|------------|--------|
| `FarmerRepository` | `farmers` (app schema when APP Supabase configured) |
| `TaskRepository` | `task_submissions`, `tasks` |
| `ProjectRepository` | `projects`, `project_assignments` |
| `PaymentRepository` | `payments` |

Sync uses `getAppSupabaseClient(token)` when `EXPO_PUBLIC_APP_SUPABASE_URL` is set.

---

## 7. Rollback

1. Backup `kilimo.db` before migration
2. Remove `EXPO_PUBLIC_APP_*` env → app falls back to Express API
3. Truncate app Supabase tables or delete app project
4. Clear app install (local SQLite cache)

---

## 8. Store builds

```bash
cd mobile
eas build --platform android
eas build --platform ios
```

`app.json`: `com.kilimobridge.app`

See also: `docs/SUPABASE_MIGRATION.md`, `docs/MIGRATION_CLARIFICATIONS.md`
