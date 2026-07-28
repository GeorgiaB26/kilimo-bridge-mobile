# Supabase + SQLite hybrid setup

Kilimo Bridge keeps **SQLite as the source of truth** (offline-friendly, local Mac demos, Render API). **Supabase** holds a **read-only mirror** for:

- Supabase Table Editor (web portal to browse farmers, users, hierarchy)
- Mobile app **online reads** when the Express API is slow or unavailable
- Client demos without losing the “no internet” local SQLite workflow

```
┌──────────────────┐     writes      ┌─────────────────┐
│  Mobile / Web    │ ──────────────► │  Express API    │
│  (Netlify app)   │                 │  (Render/Mac)   │
└────────┬─────────┘                 └────────┬────────┘
         │                                    │
         │ online reads (mirror)              │ SQLite kilimo.db
         ▼                                    ▼
┌──────────────────┐     sync upsert  ┌─────────────────┐
│  Supabase        │ ◄─────────────── │  sync service   │
│  PostgreSQL      │                  │  (after import) │
│  + Table UI      │                  └─────────────────┘
└──────────────────┘
```

**Writes always go through the API → SQLite.** Supabase is synced from SQLite, not vice versa.

---

## 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Note your **Project URL** and keys (Settings → API):
   - `anon` key → mobile / public reads
   - `service_role` key → backend sync only (never expose in Netlify or mobile)

---

## 2. Run the mirror schema

In Supabase → **SQL Editor**, paste and run:

`supabase/migrations/20250728000000_mirror_schema.sql`

Or with the Supabase CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This creates mirror tables (`farmers`, `users`, hierarchy tables, etc.) plus `portal_dashboard` view.

RLS policies allow **read-only** access via the anon key. Only the backend service role can upsert rows.

---

## 3. Backend env (Render or local)

Add to `backend/.env` or Render environment:

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role secret |
| `SUPABASE_SYNC_ON_STARTUP` | `true` (optional — sync after each deploy) |

Keep existing SQLite vars (`DATABASE_PATH`, etc.) — they are still required.

---

## 4. First sync from your Mac (3,244 farmers)

With your full `kilimo.db` locally:

```bash
cd backend
# copy .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run sync:supabase
```

Or trigger from the app after login as admin:

- `POST /api/admin/sync/supabase/sync`
- `GET /api/admin/sync/supabase/status`

Imports also trigger a background sync when complete.

---

## 5. Mobile / Netlify env

Add to Netlify build env and `mobile/.env.production`:

| Variable | Value |
|----------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

Rebuild Netlify after adding these.

The mobile app:

- **Writes** (register farmer, import, tasks) → Express API → SQLite
- **Reads** → API first; falls back to Supabase mirror if API fails (`hybridData.ts`)
- Admin dashboard shows API vs Supabase farmer counts when configured

---

## 6. Web portal in Supabase

Use Supabase’s built-in tools:

| Tool | Use |
|------|-----|
| **Table Editor** | Browse `farmers`, `users`, `program_projects`, etc. |
| **SQL Editor** | `SELECT * FROM portal_dashboard` for live stats |
| **Dashboard** | Project health, API usage |

Optional: build a custom admin site on Supabase hosting that reads mirror tables via the anon key (read-only).

---

## 7. Offline / no internet workflow (unchanged)

| Scenario | What to use |
|----------|-------------|
| Field agent, no internet | Run backend on laptop + SQLite; mobile points to `localhost` API |
| Client demo with full data | `bash scripts/share-demo.sh` or local Mac + ngrok |
| Hosted demo | Render API + SQLite persistent disk + Supabase mirror for table UI |
| Mobile online browse | API primary; Supabase fallback |

---

## Security notes

- Never put `SUPABASE_SERVICE_ROLE_KEY` in Netlify or mobile builds.
- Mirror tables exclude `password_hash` and encrypted ID fields.
- Tighten RLS later (e.g. farmers read only their own row) when you move auth to Supabase Auth.
- For production, restrict anon read policies if the mirror contains sensitive columns.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Supabase shows 0 farmers | Run `npm run sync:supabase` from Mac with full DB |
| Sync fails “relation does not exist” | Run migration SQL in Supabase SQL Editor |
| Mobile shows API offline but Supabase works | Expected hybrid fallback — check `hybridData.ts` |
| Counts differ API vs Supabase | Run manual sync; check `sync_meta.last_sync_status` |
