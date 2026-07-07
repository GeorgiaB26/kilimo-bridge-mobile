#!/usr/bin/env bash
# Nuclear reset of Expo web cache — fixes old "Register Farmer" home screen.
# Run from project root:  npm run mobile:fresh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

echo ""
echo "=== Fresh Mobile Start ==="
echo ""

# Kill old Expo on 8081
if lsof -ti:8081 >/dev/null 2>&1; then
  echo "Stopping old Expo on port 8081..."
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "Clearing caches..."
rm -rf .expo
rm -rf node_modules/.cache
rm -rf dist web-build .metro-cache 2>/dev/null || true

echo "Installing dependencies..."
npm install

echo ""
echo "Starting Expo web (cache cleared)..."
echo ""
echo "  → Open http://localhost:8081"
echo "  → You MUST see: 'Sign In' + 'Open Farmer Platform' button"
echo "  → If you still see 'Register Farmer' + 'Import CSV', hard-refresh: Cmd+Shift+R"
echo "  → Or use a Private/Incognito browser window"
echo ""

npx expo start --web --clear
