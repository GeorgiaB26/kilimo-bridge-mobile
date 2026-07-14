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

SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "==> Uploading $DB_FILE ($SIZE) to $API_URL …"

HTTP_CODE=$(curl -s -o /tmp/kb-restore-response.json -w "%{http_code}" \
  -X POST "$API_URL/api/admin/database/restore" \
  -H "X-Restore-Secret: $RESTORE_DB_SECRET" \
  -F "database=@$DB_FILE")

cat /tmp/kb-restore-response.json
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "Upload failed (HTTP $HTTP_CODE)"
  exit 1
fi

echo ""
echo "==> Waiting for Render to restart (~45s)…"
sleep 45

curl -s "$API_URL/health" && echo ""
echo "Done. Refresh your Netlify site — farmers and all accounts should appear."
