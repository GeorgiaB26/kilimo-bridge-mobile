#!/usr/bin/env bash
# Full reset: database + instructions to clear browser session
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Removing database..."
rm -f backend/data/kilimo.db backend/data/kilimo.db-wal backend/data/kilimo.db-shm

echo ""
echo "✓ Database deleted. Next steps:"
echo ""
echo "  1. Restart backend:  cd backend && npm run dev"
echo "  2. Restart mobile:   cd mobile && npx expo start --web --clear"
echo "  3. In browser:       click 'Clear saved login' then 'Open Farmer Platform'"
echo ""
