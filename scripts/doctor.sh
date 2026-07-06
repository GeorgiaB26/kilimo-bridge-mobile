#!/usr/bin/env bash
# Diagnose setup problems — run from anywhere:
#   bash scripts/doctor.sh
# Or from project root:
#   npm run doctor

set -u

echo ""
echo "=== Kilimo Bridge Doctor ==="
echo ""

# Find project root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "1. Where am I?"
echo "   Current folder: $(pwd)"
echo "   Project root:   $ROOT"
echo ""

echo "2. Required tools"
check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "   ✓ $1 — $($1 --version 2>/dev/null | head -1)"
    return 0
  else
    echo "   ✗ $1 — NOT INSTALLED"
    return 1
  fi
}

MISSING=0
check_cmd node || MISSING=1
check_cmd npm || MISSING=1
check_cmd git || MISSING=1

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "   Install Node.js (includes npm): https://nodejs.org"
  echo "   Install git: xcode-select --install   (on Mac)"
  echo ""
fi

echo ""
echo "3. Project files"
if [ -f "$ROOT/package.json" ] && [ -d "$ROOT/mobile" ] && [ -d "$ROOT/backend" ]; then
  echo "   ✓ Project found at $ROOT"
else
  echo "   ✗ Project NOT found in $ROOT"
  echo ""
  echo "   Clone it first:"
  echo "   cd ~"
  echo "   git clone https://github.com/GeorgiaB26/kilimo-bridge-mobile.git"
  echo "   cd kilimo-bridge-mobile"
  echo ""
  exit 1
fi

cd "$ROOT"

echo ""
echo "4. App version"
if grep -q "RootNavigator" mobile/App.tsx 2>/dev/null; then
  echo "   ✓ New login version (correct)"
else
  echo "   ✗ Old version (Register Farmer home screen)"
  echo "   → Run: git pull origin main"
fi

echo ""
echo "5. Dependencies"
[ -d backend/node_modules ] && echo "   ✓ backend/node_modules" || echo "   ✗ backend — run: cd backend && npm install"
[ -d mobile/node_modules ] && echo "   ✓ mobile/node_modules" || echo "   ✗ mobile — run: cd mobile && npm install"

echo ""
echo "6. Servers"
if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "   ✓ Backend running on http://localhost:3001"
else
  echo "   ✗ Backend not running"
  echo "   → Terminal 1: cd $ROOT/backend && npm run dev"
fi

if curl -sf http://localhost:8081 >/dev/null 2>&1; then
  echo "   ✓ Something on http://localhost:8081 (Expo web)"
else
  echo "   ✗ Nothing on http://localhost:8081"
  echo "   → Terminal 2: cd $ROOT/mobile && npx expo start --web --clear"
fi

echo ""
echo "=== If commands failed before ==="
echo ""
echo "Always cd into the project first:"
echo "  cd ~/kilimo-bridge-mobile"
echo ""
echo "If that says 'no such file', clone the repo (see step 3 above)."
echo ""
echo "Then run ONE command at a time:"
echo "  npm run setup"
echo "  npm run reset"
echo "  cd backend && npm run dev"
echo ""
echo "=== Done ==="
echo ""
