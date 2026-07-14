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
- Your full farmer database stays on your Mac (2,600+ records)

---

## Permanent hosting (Render + Netlify)

You need **two** hosts:

| Part | Host | Purpose |
|------|------|---------|
| Web app (shareable link) | **Netlify** | Admin login in browser |
| API + database | **Render** | Farmers, search, imports |

Netlify alone cannot run the backend or your SQLite database.

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

```
NODE_ENV=production
PORT=10000
PILOT_OTP=true
JWT_SECRET=<run: openssl rand -hex 32>
ENCRYPTION_KEY=<run: openssl rand -hex 16>
CORS_ORIGINS=https://YOUR-NETLIFY-SITE.netlify.app
```

Do **not** set `DATABASE_PATH` unless you know you need a custom location — the default `backend/data/kilimo.db` works on Render.

5. Click **Create Web Service**. Note your API URL, e.g.:

`https://kilimo-bridge-api.onrender.com`

6. Test health:

```bash
curl https://kilimo-bridge-api.onrender.com/health
```

### Your farmer data (important)

The Netlify link is only the **web app**. Your imported farmers live in **`backend/data/kilimo.db` on your Mac** — Render starts empty.

**Option A — Upload your database (fastest, ~2 min):**

1. Render → Environment → add:
   ```
   RESTORE_DB_SECRET=<pick a long random password>
   ```
2. Redeploy Render, then on your Mac:
   ```bash
   cd ~/kilimo-bridge-mobile
   git pull
   export RESTORE_DB_SECRET='same-password-as-render'
   bash scripts/push-db-to-render.sh
   ```
3. Wait ~45s, refresh Netlify — all farmers and accounts appear.

**Option B — Re-import CSVs** via Admin → Import on the live site (slower).

**Option C — ngrok demo** from your Mac with full data: `bash scripts/share-demo.sh`

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
| Empty farmers list | API database is empty — import CSV or copy `kilimo.db` |
| API crashes: directory does not exist | Remove `DATABASE_PATH` from Render env vars, redeploy latest `main` |
| Build fails on Render | Root Directory **backend**, Build `npm run build:render`, Start `npm start` |
| `tsc` / missing `@types` errors | Render skips devDependencies when `NODE_ENV=production` — use `build:render` script |

---

## Custom domain (later)

- Netlify: `app.kilimobridge.co.ug` → point DNS to Netlify
- Render: `api.kilimobridge.co.ug` → point DNS to Render
