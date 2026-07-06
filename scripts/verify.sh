#!/usr/bin/env bash
# Quick verification — run from project root: ./scripts/verify.sh

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "=== Kilimo Bridge Verification ==="
echo ""

# 1. Check files exist
echo "1. Project structure"
for dir in backend mobile shared; do
  if [ -d "$dir" ]; then echo "   ✓ $dir/"; else echo "   ✗ $dir/ MISSING"; fi
done

# 2. Check backend
echo ""
echo "2. Backend API (http://localhost:3001)"
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "   ✓ Backend is running"
  FARMERS=$(curl -s http://localhost:3001/api/farmers | head -c 200)
  echo "   Farmers endpoint: $FARMERS..."
else
  echo "   ✗ Backend NOT running"
  echo "   → Start it with:  cd backend && npm run dev"
  echo "   → Or run:         ./scripts/start.sh"
fi

# 3. Test CSV validation (works even if backend down — shows command)
echo ""
echo "3. Test CSV import (run manually)"
echo "   npm run test:import"

# 4. Mobile
echo ""
echo "4. Mobile app"
if [ -d "mobile/node_modules" ]; then
  echo "   ✓ Dependencies installed"
  echo "   → Web preview:  cd mobile && npx expo start --web"
  echo "   → Expo menu:    cd mobile && npm start"
else
  echo "   ✗ Run: cd mobile && npm install"
fi

echo ""
echo "=== Done ==="
echo ""
