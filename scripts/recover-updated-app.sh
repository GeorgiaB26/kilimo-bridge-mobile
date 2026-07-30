#!/usr/bin/env bash
# Get back the updated Farmer / Agent / Banking build (not main / old Netlify).
# Run from anywhere: bash scripts/recover-updated-app.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="cursor/app-supabase-build-dbb0"

echo ""
echo "=== Recover Kilimo Bridge updated app ==="
echo ""

git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo ""
echo "Branch: $(git branch --show-current)"
echo "Latest: $(git log -1 --oneline)"
echo ""
echo "1. Terminal 1:  npm run backend"
echo "2. Terminal 2:  npm run mobile:fresh"
echo "3. Open:        http://localhost:8081"
echo ""
echo "Login screen should show Build v2.9.0-farmer-agent-banking"
echo "Admin/staff quick card → Users tab = Platform logins"
echo ""
