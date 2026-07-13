# Deploy Kilimo Bridge for client preview

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
| Build Command | `npm install && npm run build` |
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
DATABASE_PATH=/opt/render/project/src/data/kilimo.db
```

5. Click **Create Web Service**. Note your API URL, e.g.:

`https://kilimo-bridge-api.onrender.com`

6. Test health:

```bash
curl https://kilimo-bridge-api.onrender.com/health
```

### Your farmer data (important)

Render starts with an **empty** database. To show your 2,600+ imported farmers:

- Copy `backend/data/kilimo.db` from your Mac to Render (persistent disk on paid plan), **or**
- Re-import CSVs via the admin UI once live, **or**
- For a quick demo, use demo seed data (few sample farmers)

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
| Build fails on Render | Use branch **main**, Root Directory **backend**, Build `npm install && npm run build`, Start `npm start` |
| `tsc` / TypeScript errors | Pull latest `main` — shared package paths are fixed for production build |

---

## Custom domain (later)

- Netlify: `app.kilimobridge.co.ug` → point DNS to Netlify
- Render: `api.kilimobridge.co.ug` → point DNS to Render
