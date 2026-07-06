# Kilimo Bridge Mobile

React Native (Expo) mobile app with Node.js backend for farmer registration and CSV bulk import.

## Features (Phase 1 — Registration & CSV Import)

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

### Backend API

```bash
cd backend
npm install
npm run dev
```

API runs at `http://localhost:3001`

### Mobile App

```bash
cd mobile
npm install
npm start
```

Set `EXPO_PUBLIC_API_URL` to your backend URL for device testing.

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
