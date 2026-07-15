#!/usr/bin/env bash
# Copy your local farmer database to the hosted Render preview.
#
# On your Mac — paste this ONE line (replace secret if yours differs):
#   cd ~/kilimo-bridge-mobile && git pull && RESTORE_DB_SECRET=KilimoPineappleTest123\! bash scripts/push-db-to-render.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${API_URL:-https://kilimo-bridge-mobile.onrender.com}"
DB_FILE="${DB_FILE:-$ROOT/backend/data/kilimo.db}"

if [ -z "${RESTORE_DB_SECRET:-}" ]; then
  echo "ERROR: Secret not set."
  echo "Run: RESTORE_DB_SECRET=KilimoPineappleTest123\\! bash scripts/push-db-to-render.sh"
  exit 1
fi

if [ ! -f "$DB_FILE" ]; then
  echo "ERROR: Database not found at $DB_FILE"
  echo "Your imported farmers should be in backend/data/kilimo.db"
  exit 1
fi

# Stop local backend so SQLite isn't locked
if lsof "$DB_FILE" >/dev/null 2>&1; then
  echo "==> Stopping local backend…"
  pkill -f "tsx watch src/index.ts" 2>/dev/null || true
  pkill -f "node dist/backend/src/index.js" 2>/dev/null || true
  sleep 2
fi

# Checkpoint WAL into main file
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null || true
fi

UPLOAD_FILE="/tmp/kilimo-upload.db"
cp "$DB_FILE" "$UPLOAD_FILE"
SIZE=$(du -h "$UPLOAD_FILE" | cut -f1)
LOCAL_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM farmers;" 2>/dev/null || echo "?")
echo "==> Local database: $LOCAL_COUNT farmers ($SIZE)"

echo "==> Render BEFORE upload:"
curl -s -H "X-Restore-Secret: $RESTORE_DB_SECRET" "$API_URL/api/setup/database/status" || echo "(could not reach API — wait 60s for Render to wake up)"
echo ""

echo "==> Uploading…"
HTTP_CODE=$(curl -s -m 120 -o /tmp/kb-restore-response.json -w "%{http_code}" \
  -X POST "$API_URL/api/setup/database/restore" \
  -H "X-Restore-Secret: $RESTORE_DB_SECRET" \
  -F "database=@$UPLOAD_FILE")

cat /tmp/kb-restore-response.json
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Upload failed (HTTP $HTTP_CODE)"
  [ "$HTTP_CODE" = "401" ] && echo "→ RESTORE_DB_SECRET does not match Render. Check Render → Environment."
  exit 1
fi

UPLOAD_COUNT=$(python3 -c "import json; print(json.load(open('/tmp/kb-restore-response.json')).get('totalFarmers','?'))" 2>/dev/null || echo "?")
echo "==> Server accepted: $UPLOAD_COUNT farmers"

echo "==> Render AFTER upload:"
curl -s -H "X-Restore-Secret: $RESTORE_DB_SECRET" "$API_URL/api/setup/database/status"
echo ""

if [ "$UPLOAD_COUNT" = "1" ] || [ "$UPLOAD_COUNT" = "?" ]; then
  echo "WARNING: Still only demo data. Check your local kilimo.db has your imports."
  exit 1
fi

echo ""
echo "SUCCESS. Open Netlify → Clear saved login → sign in again."
rm -f "$UPLOAD_FILE"
