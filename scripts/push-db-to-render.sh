#!/usr/bin/env bash
# Copy your local farmer database to the hosted Render preview.
#
# One-time on Render → Environment:
#   RESTORE_DB_SECRET=<pick a long random string>
#
# On your Mac:
#   export RESTORE_DB_SECRET='same-secret-as-render'
#   bash scripts/push-db-to-render.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${API_URL:-https://kilimo-bridge-mobile.onrender.com}"
DB_FILE="${DB_FILE:-$ROOT/backend/data/kilimo.db}"

if [ -z "${RESTORE_DB_SECRET:-}" ]; then
  echo "Set RESTORE_DB_SECRET to match Render environment variable."
  exit 1
fi

if [ ! -f "$DB_FILE" ]; then
  echo "Database not found: $DB_FILE"
  exit 1
fi

# Stop local backend so SQLite isn't locked and WAL is checkpointed
if lsof "$DB_FILE" >/dev/null 2>&1; then
  echo "==> Stopping local backend (database file in use)…"
  pkill -f "tsx watch src/index.ts" 2>/dev/null || true
  pkill -f "node dist/backend/src/index.js" 2>/dev/null || true
  sleep 2
fi

# Use main db file only (not -wal/-shm fragments)
UPLOAD_FILE="/tmp/kilimo-upload.db"
cp "$DB_FILE" "$UPLOAD_FILE"
SIZE=$(du -h "$UPLOAD_FILE" | cut -f1)
LOCAL_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM farmers;" 2>/dev/null || echo "?")
echo "==> Local database: $LOCAL_COUNT farmers ($SIZE)"
echo "==> Uploading to $API_URL …"

HTTP_CODE=$(curl -s -o /tmp/kb-restore-response.json -w "%{http_code}" \
  -X POST "$API_URL/api/setup/database/restore" \
  -H "X-Restore-Secret: $RESTORE_DB_SECRET" \
  -F "database=@$UPLOAD_FILE")

cat /tmp/kb-restore-response.json
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "Upload failed (HTTP $HTTP_CODE)"
  if [ "$HTTP_CODE" = "401" ]; then
    echo "Check RESTORE_DB_SECRET matches Render exactly."
  fi
  exit 1
fi

echo ""
echo "==> Waiting for Render to restart (~60s)…"
sleep 60

curl -s "$API_URL/health" && echo ""

echo "==> Verifying farmer count on Render…"
curl -s -X POST "$API_URL/auth/request-otp" -H "Content-Type: application/json" -d '{"phone":"+254700000002"}' > /dev/null
VERIFY=$(curl -s -X POST "$API_URL/auth/verify-otp" -H "Content-Type: application/json" -d '{"phone":"+254700000002","code":"123456"}')
TOKEN=$(echo "$VERIFY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  REMOTE_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/admin/dashboard" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalFarmers','?'))" 2>/dev/null || echo "?")
  echo "Render reports $REMOTE_COUNT farmers (local had $LOCAL_COUNT)"
  if [ "$REMOTE_COUNT" != "$LOCAL_COUNT" ] && [ "$LOCAL_COUNT" != "?" ]; then
    echo "WARNING: counts don't match — try again without redeploying Render after upload."
  else
    echo "Done. Refresh your Netlify site."
  fi
else
  echo "Could not verify — refresh Netlify and check dashboard."
fi

rm -f "$UPLOAD_FILE"
