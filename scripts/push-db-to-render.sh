#!/usr/bin/env bash
# Copy your local farmer database to the hosted Render preview.
#
# ONE line to upload farmers to Render right now:
#   cd ~/kilimo-bridge-mobile && RESTORE_DB_SECRET='KilimoPineappleTest123!' bash scripts/push-db-to-render.sh
#
# PERMANENT fix (auto-restore on every Render boot):
#   bash scripts/publish-db-backup.sh
#   Then set STARTUP_DB_URL + STARTUP_DB_TOKEN on Render (see script output)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${API_URL:-https://kilimo-bridge-mobile.onrender.com}"
DB_FILE="${DB_FILE:-$ROOT/backend/data/kilimo.db}"

if [ -z "${RESTORE_DB_SECRET:-}" ]; then
  echo "ERROR: Secret not set."
  echo "Run: RESTORE_DB_SECRET='KilimoPineappleTest123!' bash scripts/push-db-to-render.sh"
  exit 1
fi

if [ ! -f "$DB_FILE" ]; then
  echo "ERROR: Database not found at $DB_FILE"
  exit 1
fi

# Stop local backend so WAL can be merged into main file
if lsof "$DB_FILE" >/dev/null 2>&1; then
  echo "==> Stopping local backend (required before upload)…"
  pkill -f "tsx watch src/index.ts" 2>/dev/null || true
  pkill -f "node dist/backend/src/index.js" 2>/dev/null || true
  sleep 3
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 not found. Install with: brew install sqlite"
  exit 1
fi

# Merge WAL into main db — copying kilimo.db alone often uploads 0 farmers!
echo "==> Merging database WAL into main file…"
sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);"

LOCAL_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM farmers;")
SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "==> Local database: $LOCAL_COUNT farmers ($SIZE)"

if [ "$LOCAL_COUNT" -lt 100 ]; then
  echo "ERROR: Only $LOCAL_COUNT farmers in file. Expected ~2617."
  echo "Start backend locally, confirm farmers exist, stop backend, run this again."
  exit 1
fi

UPLOAD_FILE="/tmp/kilimo-upload.db"
cp "$DB_FILE" "$UPLOAD_FILE"
COPY_COUNT=$(sqlite3 "$UPLOAD_FILE" "SELECT COUNT(*) FROM farmers;")
if [ "$COPY_COUNT" != "$LOCAL_COUNT" ]; then
  echo "ERROR: Upload copy has $COPY_COUNT farmers, expected $LOCAL_COUNT."
  exit 1
fi

echo "==> Render BEFORE upload:"
curl -s -m 90 -H "X-Restore-Secret: $RESTORE_DB_SECRET" "$API_URL/api/setup/database/status" || echo "(API waking up — wait 60s)"
echo ""

echo "==> Uploading $COPY_COUNT farmers (may take 1-2 min, please wait)…"
HTTP_CODE=$(curl --progress-bar -m 300 -o /tmp/kb-restore-response.json -w "%{http_code}" \
  -X POST "$API_URL/api/setup/database/restore" \
  -H "X-Restore-Secret: $RESTORE_DB_SECRET" \
  -F "database=@$UPLOAD_FILE")
echo ""

cat /tmp/kb-restore-response.json
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Upload failed (HTTP $HTTP_CODE)"
  [ "$HTTP_CODE" = "401" ] && echo "→ Check RESTORE_DB_SECRET in Render → Environment"
  [ "$HTTP_CODE" = "000" ] && echo "→ Timed out. Open https://kilimo-bridge-mobile.onrender.com/health in browser, wait for OK, retry."
  exit 1
fi

UPLOAD_COUNT=$(python3 -c "import json; print(json.load(open('/tmp/kb-restore-response.json')).get('totalFarmers','?'))" 2>/dev/null || echo "?")
echo "==> Server accepted: $UPLOAD_COUNT farmers"

echo "==> Render AFTER upload:"
curl -s -m 30 -H "X-Restore-Secret: $RESTORE_DB_SECRET" "$API_URL/api/setup/database/status"
echo ""

if [ "$UPLOAD_COUNT" != "$LOCAL_COUNT" ]; then
  echo "ERROR: Count mismatch (local $LOCAL_COUNT vs server $UPLOAD_COUNT)"
  exit 1
fi

echo ""
echo "SUCCESS! $UPLOAD_COUNT farmers live on Render."
echo "→ Open Netlify, Clear saved login, sign in again."
rm -f "$UPLOAD_FILE"
