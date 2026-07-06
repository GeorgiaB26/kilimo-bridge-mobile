# Kilimo Bridge Mobile

React Native (Expo) mobile app with Node.js backend for farmer registration and CSV bulk import.

## Features

### Two platforms, one app

**Farmer platform** (after login as farmer):
- Dashboard with pending payments and "Claim Payment"
- Projects (active + completed, progress bars)
- Payment history and lifetime earnings
- Profile (own data only — cannot see other farmers)

**Admin platform** (after login as admin):
- Admin dashboard with platform stats
- Farmer list (agents see their region only)
- CSV bulk import (admin only)
- Manual farmer registration (admin + agents)
- User management with roles (admin/super admin only)

**Agent platform** (aggregation centre agents):
- Regional farmer list (district-scoped)
- Farmer registration with audit trail
- Payment verification workflow
- Activity log

**Banking platform** (Equity Bank officers):
- View all payment transactions
- Process M-Pesa via Equity H2H API
- Financial audit trail
- Webhook receiver for bank confirmations

### Roles & permissions

| Permission | Super Admin | Admin | Agent | Banking | Farmer |
|-----------|:-----------:|:-----:|:-----:|:-------:|:------:|
| View all farmers | ✓ | ✓ | Region only | — | Own only |
| Register farmers | ✓ | ✓ | ✓ | — | — |
| CSV import | ✓ | ✓ | — | — | — |
| Manage users | ✓ | — | — | — | — |
| View payments | ✓ | ✓ | — | ✓ | Own only |
| Process M-Pesa (H2H) | ✓ | ✓ | — | ✓ | — |
| Payment verification | ✓ | ✓ | ✓ | ✓ | — |
| Audit logs | ✓ | ✓ | Own + region | Financial | — |
| Claim M-Pesa | — | — | — | — | ✓ |

### Farmer Registration (7-screen flow)
1. **Basic Info** — Name, gender, phone, national ID
2. **Location** — Country, district, sub-county, parish, village
3. **Membership** — Cooperative group, aggregation center, membership type
4. **Details** — Occupation, land size
5. **Projects** — Optional project assignments (1–3)
6. **Photo** — Camera/gallery upload or initials avatar
7. **Confirm** — Review summary and submit

### Admin CSV Import
1. Upload CSV file (max 50MB)
2. Validate all fields against rules
3. Preview first 10 rows with valid/invalid/duplicate status
4. Confirm and import with progress tracking
5. View completion report with error details

### CSV Format

```
Key | Name | Gender | ID Number | Membership Group | Aggregation center | Phone | Country | District | Sub-County | Parish | Village | Membership Type | Occupation | Size of land | Project 1 | Project 2 | Project 3 | Picture
```

## Quick Start

**Run everything from the project root** (`kilimo-bridge-mobile/`):

```bash
# 1. First-time setup (installs dependencies)
npm run setup

# 2. Check what's working
npm run verify

# 3. Start backend + see available commands
npm run start
```

### Login (role-based access)

The app now has **two platforms in one**:

| Role | Phone | Login | What they see |
|------|-------|-------|---------------|
| **Admin** | `+254700000002` | OTP `123456` | Dashboard, all farmers, CSV import, users |
| **Agent** | `+254700000003` | OTP `123456` | Regional farmers, register, audit log |
| **Banking** | `+254700000004` | Password `Banking@2026` | Transactions, M-Pesa H2H processing |
| **Farmer** | `+254712345678` | OTP `123456` | Own dashboard, projects, payments, profile only |
| **Super Admin** | `+254700000001` | OTP `123456` | Full access including user management |

> **First time after update?** Delete `backend/data/kilimo.db` and restart the backend to create new tables.

### Backend API (Terminal 1)

```bash
cd backend
npm install
npm run dev
```

You should see: `Kilimo Bridge API running on http://localhost:3001`

Test it:
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/farmers
```

### Mobile App (Terminal 2)

**Option A — Web browser (easiest to view):**
```bash
cd mobile
npm install
npm run web
# Opens at http://localhost:8081
```

**Option B — Expo dev server (for phone/simulator):**
```bash
cd mobile
npm start
# Scan QR code with Expo Go app, or press 'w' for web
```

> **Important:** Run these from inside the `mobile/` or `backend/` folders, or use the root shortcuts (`npm run backend`, `npm run mobile:web`).

Set `EXPO_PUBLIC_API_URL` to your backend URL for device testing (e.g. `http://YOUR_IP:3001/api`).

### Test CSV Import

```bash
npm run test:import
```

Uses `backend/data/test-farmers.csv` (5 test rows from spec).

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reference` | Districts, cooperatives, projects |
| POST | `/api/farmers/register` | Manual farmer registration |
| GET | `/api/farmers` | List farmers |
| POST | `/api/admin/farmers/import/validate` | Validate CSV (multipart upload) |
| POST | `/api/admin/farmers/import/validate-text` | Validate CSV (raw text body) |
| POST | `/api/admin/farmers/import/confirm` | Confirm and start import |
| GET | `/api/admin/farmers/import/:sessionId/progress` | Import progress |
| GET | `/api/admin/farmers/import/:sessionId/complete` | Import completion report |
| POST | `/api/auth/login` | Password login (banking role, bcrypt) |
| GET | `/api/banking/payments` | List payment transactions |
| POST | `/api/banking/payments/:id/process` | Process M-Pesa via Equity H2H |
| GET | `/api/banking/audit` | Financial audit trail |
| POST | `/api/webhooks/equity` | Equity Bank transaction webhook |
| POST | `/api/agents/register` | Register agent with government ID |
| GET | `/api/agents/farmers` | Farmers in agent's region |
| GET | `/api/agents/audit` | Agent activity log |
| POST | `/api/agents/payments/:id/verify` | Submit payment verification |
| GET | `/api/audit` | Query audit logs |

## Security & Banking

### Data protection
- **Passwords**: bcrypt hashing (12 rounds), never stored in plaintext
- **Sensitive fields**: AES-256-GCM encryption for ID numbers and bank accounts (`id_number_encrypted`, `bank_account_encrypted`)
- **Transport**: HTTPS/TLS enforced in production (helmet HSTS, redirect)
- **Backups**: `scripts/backup-encrypted.sh` creates OpenSSL-encrypted database backups

### Audit trails
Every financial transaction, agent action, and farmer data access is logged with timestamp and user ID in `audit_logs`.

### Equity Bank H2H
Configure in `backend/.env` (see `.env.example`):
- `EQUITY_H2H_URL`, `EQUITY_API_KEY`, `EQUITY_WEBHOOK_SECRET`
- Rate limiting on banking and webhook endpoints
- 30s timeout with graceful fallback (dev mode simulates success when no API key)

### Environment variables
Copy `backend/.env.example` to `backend/.env` and set production values for `JWT_SECRET`, `ENCRYPTION_KEY`, and Equity credentials.

## Design

- Primary: `#1A4D3E` (dark forest green)
- Accent: `#D4AF6A` (gold)
- Min touch target: 48px

## Project Structure

```
├── mobile/          # Expo React Native app
├── backend/         # Express API + SQLite
├── shared/          # Validation rules & types
└── backend/data/    # Test CSV & database
```
