# Kilimo Bridge Mobile

React Native (Expo) mobile app + Node.js/Express API for farmer registration and CSV bulk import.
See `README.md` for the product overview, API endpoints, and standard run commands.

## Cursor Cloud specific instructions

Monorepo with three packages, each with its own `package.json`/lockfile (there is **no** root
npm workspaces config — install/build each package separately):

- `backend/` — Express + `better-sqlite3` API (TypeScript, run via `tsx`).
- `mobile/` — Expo SDK 57 React Native app (React 19 / RN 0.86).
- `shared/` — shared validation rules & types, imported by the backend via relative path.

### Backend
- Run in dev: `npm run backend` (root) or `cd backend && npm run dev`. Serves `http://localhost:3001`.
- Uses a local SQLite DB that is **auto-created and seeded on startup** (`initDatabase()` + `seedDatabase()` in `backend/src/index.ts`). The `.db` files are gitignored; delete them to reset state.
- CSV import smoke test: `npm run test:import` (root) — imports `backend/data/test-farmers.csv`.
- Gotcha: `npm run build` (`tsc`) in `backend/` currently FAILS due to pre-existing code issues
  (shared files imported from outside the backend `rootDir`, plus a strict type error). This is a
  code issue, not an environment problem. The dev/run path uses `tsx` (esbuild transpile, no
  typechecking), so `npm run dev` works fine. Do not "fix" the environment for this — it's the app.

### Mobile (Expo)
- Native run: `cd mobile && npm start` (Expo Go / device). Not usable on this headless VM.
- Web preview (recommended for testing here): `cd mobile && npm run web` → `http://localhost:8081`.
  The first bundle takes ~10-20s. Web depends on `react-dom`, `react-native-web`, and
  `@expo/metro-runtime` (already in `mobile/package.json`).
- API URL: the app defaults to `http://localhost:3001/api`. Override with `EXPO_PUBLIC_API_URL`
  (needed when testing on a physical device).

### Lint / tests
- No linter and no unit-test framework are configured. "Testing" is: run the backend + `test:import`,
  and exercise the mobile web UI against the running backend.

### Note on the base branch
The application code lives on feature branches; `main` is an empty scaffold (only `README.md`). If a
checkout shows no app code, you are on the empty `main` branch.
