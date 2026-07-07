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
echo "2. Checking native modules..."
if ! node -e "require('better-sqlite3'); console.log('   ✓ better-sqlite3 OK')"; then
  echo ""
  echo "   ✗ better-sqlite3 failed to load."
  echo "   Try:  npm rebuild better-sqlite3"
  echo "   Or install Node 20 LTS from https://nodejs.org (recommended)"
  exit 1
fi

echo ""
echo "3. Checking database..."
if ! npx tsx -e "
  import { initDatabase } from './src/db/database';
  initDatabase();
  console.log('   ✓ Database OK');
"; then
  echo "   ✗ Database failed — see error above"
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
echo "4. Starting server..."
echo "   Leave this window OPEN. You should see:"
echo "   Kilimo Bridge API running on http://localhost:3001"
echo ""

npm run dev
