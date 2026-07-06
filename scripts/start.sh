#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "============================================"
echo "  Kilimo Bridge — Quick Start"
echo "============================================"
echo ""

# Install deps if missing
if [ ! -d "backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  (cd backend && npm install)
fi
if [ ! -d "mobile/node_modules" ]; then
  echo "Installing mobile dependencies..."
  (cd mobile && npm install)
fi

# Kill anything on port 3001
if lsof -ti:3001 >/dev/null 2>&1; then
  echo "Stopping existing process on port 3001..."
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo ""
echo "Starting backend API on http://localhost:3001 ..."
(cd backend && npm run dev) &
BACKEND_PID=$!
sleep 2

echo ""
echo "Testing backend..."
if curl -sf http://localhost:3001/health > /dev/null; then
  echo "  ✓ Backend is running"
  curl -s http://localhost:3001/health
  echo ""
else
  echo "  ✗ Backend failed to start"
  kill $BACKEND_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "============================================"
echo "  Ready! Use these commands:"
echo "============================================"
echo ""
echo "  Test CSV import:"
echo "    npm run test:import"
echo ""
echo "  View farmers in API:"
echo "    curl http://localhost:3001/api/farmers"
echo ""
echo "  View reference data:"
echo "    curl http://localhost:3001/api/reference"
echo ""
echo "  Start mobile app (web browser):"
echo "    cd mobile && npx expo start --web"
echo ""
echo "  Start mobile app (terminal UI):"
echo "    cd mobile && npm start"
echo ""
echo "  Backend PID: $BACKEND_PID (running in background)"
echo "  To stop backend: kill $BACKEND_PID"
echo ""
