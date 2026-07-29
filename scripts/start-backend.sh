#!/usr/bin/env bash
# Start backend with install + health check. Run from project root:
#   bash scripts/start-backend.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

echo ""
echo "=== Kilimo Bridge Backend ==="
echo ""

# Free port 3001 if something is stuck
if lsof -ti:3001 >/dev/null 2>&1; then
  echo "Stopping old process on port 3001..."
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "1. Installing dependencies..."
npm install

echo ""
echo "2. Checking database connection..."
if ! npx tsx -e "
  import { testConnection } from './src/db/database';
  const { farmerCount } = await testConnection();
  console.log('   ✓ Postgres OK (' + farmerCount + ' farmers)');
"; then
  echo "   ✗ Database connection failed — check DATABASE_URL in backend/.env"
  exit 1
fi

# If something already started on 3001 during checks, report it
if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo ""
  echo "✓ Backend already running on http://localhost:3001"
  curl -s http://localhost:3001/health
  echo ""
  exit 0
fi

echo ""
echo "3. Starting server..."
echo "   Leave this window OPEN. You should see:"
echo "   Kilimo Bridge API running on http://localhost:3001"
echo ""

npm run dev
