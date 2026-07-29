# Deploy Kilimo Bridge for client preview

## Easiest way to share with a client (recommended for now)

Skip Render/Netlify while you're testing. Run the app on your Mac and use **ngrok** for a public link your client can open in any browser.

**One-time setup:**
```bash
brew install ngrok
# Sign up free at https://ngrok.com, then:
ngrok config add-authtoken YOUR_TOKEN
```

**Each time you want to share:**
```bash
cd ~/kilimo-bridge-mobile
bash scripts/share-demo.sh
```

The script prints a link like `https://abc123.ngrok-free.app` — send that to your client.

- **Login:** `+254700000002`
- **OTP:** `123456`
- Keep the terminal open while they test
- Farmer data comes from your **Supabase Postgres** database (same data whether you run locally or on Render)

---

## Permanent hosting (Render + Netlify + Supabase)

You need **three** pieces:

| Part | Host | Purpose |
|------|------|---------|
| Web app (shareable link) | **Netlify** | Admin login in browser |
| API | **Render** | Express backend |
| Database | **Supabase** | Postgres — farmers, users, tasks, payments |

Netlify cannot run the backend. Render does not host the database file — **Supabase** holds all persistent data.

---

## Part 0 — Supabase database (one-time)

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema migrations (or apply the SQL from your Supabase project setup).
3. Copy the **connection string** (Settings → Database → Connection string → **Transaction pooler**, port 6543):

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

4. Use this as `DATABASE_URL` locally (`backend/.env`) and on Render.

**Backups:** Supabase handles automated backups on paid plans. There is no local `.db` file to upload or restore — point every environment at the same `DATABASE_URL` (or separate Supabase projects for staging/production).

**Importing farmers:** Use Admin → CSV Import in the app, or connect your local backend to the same Supabase URL and import from your Mac.

---

## Part 1 — Deploy API on Render (~15 min)

1. Go to [render.com](https://render.com) and sign up (free tier is fine).
2. **New → Web Service** → connect GitHub repo `kilimo-bridge-mobile`.
3. Settings:

| Field | Value |
|-------|--------|
| Name | `kilimo-bridge-api` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm run build:render` |
| Start Command | `npm start` |
| Plan | Free |

4. **Environment variables** (Render → Environment):

Run on your Mac first:

```bash
bash scripts/generate-render-secrets.sh
```

Copy the **output values** into Render (not the command text):

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `PILOT_OTP` | `true` |
| `DATABASE_URL` | Supabase transaction pooler connection string |
| `JWT_SECRET` | paste 64-char hex from script |
| `ENCRYPTION_KEY` | paste 64-char hex from script |
| `CORS_ORIGINS` | `https://YOUR-NETLIFY-SITE.netlify.app` |

Do **not** set `PORT` manually — Render sets it automatically.

Do **not** paste placeholder text like `<run: openssl rand -hex 32>` — that is an instruction, not a secret.

Do **not** set `DATABASE_PATH`, `RESTORE_DB_SECRET`, or `STARTUP_DB_URL` — those were for the old SQLite workflow and are no longer used.

5. Click **Create Web Service**. Note your API URL, e.g.:

`https://kilimo-bridge-api.onrender.com`

6. Test health:

```bash
curl https://kilimo-bridge-api.onrender.com/health
```

You should see `"status":"ok"` and a farmer count matching your Supabase data.

### Your farmer data (important)

The Netlify link is only the **web app**. All farmer records live in **Supabase Postgres**, not on Render's filesystem.

- Local dev and Render both use the same `DATABASE_URL` → same data everywhere.
- Redeploying Render does **not** wipe farmer data.
- To add farmers on production: CSV import via Admin, or import locally against the same Supabase URL.

### Stop Render sleeping (free — do this today)

Render free tier sleeps after ~15 min idle → clients see timeouts on first request.

1. Go to [uptimerobot.com](https://uptimerobot.com) (free account)
2. **Add monitor** → type **HTTP(s)**
3. URL: `https://kilimo-bridge-api.onrender.com/health`
4. Interval: **5 minutes**
5. Save

This pings Render every 5 min so it stays awake for clients. Your laptop can be off — Supabase keeps the data.

### Preview login — all account types

With `PILOT_OTP=true`, the login screen **Quick access** buttons work on Netlify:

| Button | Account |
|--------|---------|
| Open Farmer Platform | +254712345678 |
| Open Admin Dashboard | +254700000002 |
| Open Agent Platform | +254700000003 |
| Open Banking Platform | +254700000004 (password `Banking@2026`) |

Or use phone OTP: any seeded account + code `123456`.

---

## Part 2 — Deploy web app on Netlify (~10 min)

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**.
2. Connect GitHub → select `kilimo-bridge-mobile`.
3. Build settings (should auto-detect from `netlify.toml`):

| Field | Value |
|-------|--------|
| Build command | `bash scripts/build-web.sh` |
| Publish directory | `mobile/dist` |
| Branch | `main` |

4. **Environment variables** (Site settings → Environment variables):

```
EXPO_PUBLIC_API_URL=https://kilimo-bridge-api.onrender.com/api
```

Replace with your real Render URL from Part 1.

5. Deploy. Your shareable link will be like:

`https://random-name-123.netlify.app`

6. Update Render `CORS_ORIGINS` to match your Netlify URL, then redeploy Render.

---

## Part 3 — Share with clients

Send them:

- **Link:** `https://your-site.netlify.app`
- **Login:** admin phone `+254700000002`, OTP `123456` (while `PILOT_OTP=true`)
- **Note:** “Web preview of Kilimo Bridge admin platform. Farmer mobile app coming after banking integration.”

Optional: Netlify → **Site settings → Access control** → password-protect the site for draft reviews.

---

## Local test before Netlify

```bash
cd ~/kilimo-bridge-mobile
EXPO_PUBLIC_API_URL=https://your-render-api.onrender.com/api bash scripts/build-web.sh
cd mobile && npx serve dist
```

Open the URL `serve` prints.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page on Netlify | Check Netlify deploy logs; build must finish without errors |
| Login fails | `EXPO_PUBLIC_API_URL` must end with `/api` |
| CORS error in browser | Add Netlify URL to Render `CORS_ORIGINS` |
| **Too many login attempts** | Redeploy latest `main`. Ensure `PILOT_OTP=true`. Use Quick access buttons. |
| **Deploy fails / env misconfigured** | `JWT_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` must be set. Remove `PORT` from env — let Render set it. |
| Empty farmers list | Check `DATABASE_URL` on Render points to Supabase with data. Import CSV via Admin if empty. |
| API fails on startup: `DATABASE_URL is not set` | Add Supabase connection string to Render environment and redeploy. |
| Build fails on Render | Root Directory **backend**, Build `npm run build:render`, Start `npm start`. If Root Directory is blank, use Build `npm run build:render` and Start `npm run start:api` from repo root. |
| `tsc` / missing `@types` errors | Render skips devDependencies when `NODE_ENV=production` — use `build:render` script |
| Connection timeout to Supabase | Use the **transaction pooler** URL (port 6543), not the direct connection (port 5432), from serverless hosts like Render. |

---

## Custom domain (later)

- Netlify: `app.kilimobridge.co.ug` → point DNS to Netlify
- Render: `api.kilimobridge.co.ug` → point DNS to Render
