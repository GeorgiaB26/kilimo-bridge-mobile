# Migration clarification answers (Kilimo Bridge)

These are the **7 questions** from the migration brief, answered for this codebase.

## 1. What is your current SQLite database schema?

**Location:** `backend/data/kilimo.db` (server-side SQLite, not on the phone today).

**Library:** `better-sqlite3` in Express (`backend/src/db/database.ts`).

**Export schema locally:**
```bash
sqlite3 backend/data/kilimo.db ".schema" > schema-export.sql
cd backend && npx tsx scripts/export-schema.ts
```

**Tables (20+):** `membership_groups`, `projects`, `farmers`, `users`, `otp_codes`, `farmer_projects`, `payments`, `notifications`, `audit_logs`, `agents`, `bank_transactions`, `payment_verifications`, `import_sessions`, `locations`, `aggregation_centres`, `sectors`, `programs`, `program_projects`, `tasks`, `program_project_farmers`, `farmer_tasks`, `centre_inventory`.

Primary keys are **TEXT** (UUID strings), not autoincrement integers.

---

## 2. How many rows in each table? (approximate)

| Environment | Farmers | Notes |
|-------------|---------|--------|
| **Your Mac (full)** | ~3,244 | LEOART cooperative import |
| **Render (live)** | varies | Wipes on redeploy unless disk/restore |
| **Fresh seed** | 1 demo farmer | After empty DB + seed |

Run on your Mac:
```bash
sqlite3 backend/data/kilimo.db "SELECT 'farmers', COUNT(*) FROM farmers;"
```

**Your input needed:** Confirm current Mac row counts before production migration.

---

## 3. Are there images/files? How stored?

- **Farmer photos:** `farmers.picture_url` — URL string or empty (not BLOB in DB).
- **Task evidence:** `farmer_tasks.photo_evidence_url` — URL string.
- **No large BLOB tables** in SQLite today.
- **Target:** Supabase Storage for uploads; DB holds URLs only (see Task 9).

---

## 4. What SQLite library do you use?

| Layer | Library |
|-------|---------|
| **Backend (current)** | `better-sqlite3` |
| **Mobile (new)** | `expo-sqlite` — local offline cache on Android/iOS |
| **Not used** | Room, sqflite (Flutter), Realm |

**Stack:** Expo SDK 57 + React Native 0.86 (not Flutter).

---

## 5. What authentication system?

- **Phone + OTP** (pilot: fixed OTP `123456` when `PILOT_OTP=true`).
- **Password** for banking role (`Banking@2026` demo).
- **JWT** issued by Express (`JWT_SECRET`), 7-day expiry.
- **Not** Supabase Auth yet — mobile passes Kilimo JWT to Supabase REST for RLS (configure Supabase JWT secret = `JWT_SECRET`).

Demo accounts: `+254700000002` (admin), `+254712345678` (farmer).

---

## 6. Do you already have a Supabase project?

**Your input needed:** Project URL and keys.

If not created:
1. [supabase.com](https://supabase.com) → New project
2. SQL Editor → run `supabase/migrations/*.sql`
3. Settings → API → copy URL, anon key, service role key
4. Settings → API → JWT Settings → set JWT secret to match Render `JWT_SECRET`

---

## 7. What is your rollback plan if migration fails?

1. **Keep `kilimo.db` backup** before migration (`cp backend/data/kilimo.db backend/data/kilimo.db.pre-migration`).
2. **Render:** restore via `RESTORE_DB_SECRET` + `push-db-to-render.sh`.
3. **Supabase:** truncate mirror tables or delete project and re-run migration script.
4. **Mobile:** clear local cache — uninstall app or delete `kilimo_local.db`.
5. **Feature flag:** `EXPO_PUBLIC_SYNC_MODE=api` falls back to API-only (no local sync).

---

## Proceeding with build

Implementation uses **TEXT primary keys** (matching existing data), adds `is_deleted`, `synced_at`, sync queue on device, and **last-write-wins** conflict resolution unless you request user-prompt merges later.
