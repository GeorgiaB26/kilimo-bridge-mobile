#!/usr/bin/env bash
# Publish your local kilimo.db to GitHub Releases so Render can auto-restore on every boot.
#
# One-time setup:
#   brew install gh
#   gh auth login
#
# Run whenever farmers change:
#   bash scripts/publish-db-backup.sh
#
# Then set on Render → Environment:
#   STARTUP_DB_URL=https://github.com/GeorgiaB26/kilimo-bridge-mobile/releases/download/db-backup/kilimo.db
#   STARTUP_DB_TOKEN=<github personal access token with repo read access>
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="${DB_FILE:-$ROOT/backend/data/kilimo.db}"
TAG="db-backup"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: brew install gh && gh auth login"
  exit 1
fi

if [ ! -f "$DB_FILE" ]; then
  echo "Database not found: $DB_FILE"
  exit 1
fi

if lsof "$DB_FILE" >/dev/null 2>&1; then
  echo "Stop local backend first (Ctrl+C in backend terminal)"
  exit 1
fi

sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM farmers;")
echo "==> Publishing $COUNT farmers ($(du -h "$DB_FILE" | cut -f1))…"

UPLOAD="/tmp/kilimo-backup.db"
cp "$DB_FILE" "$UPLOAD"

gh release delete "$TAG" -y 2>/dev/null || true
gh release create "$TAG" "$UPLOAD" \
  --repo GeorgiaB26/kilimo-bridge-mobile \
  --title "Kilimo Bridge database backup" \
  --notes "Auto-restored by Render on startup. $COUNT farmers."

URL="https://github.com/GeorgiaB26/kilimo-bridge-mobile/releases/download/${TAG}/kilimo.db"

echo ""
echo "=============================================="
echo "  Add these to Render → Environment:"
echo ""
echo "  STARTUP_DB_URL=$URL"
echo "  STARTUP_DB_TOKEN=<your-github-token>"
echo ""
echo "  Then Manual Deploy → Deploy latest commit"
echo "  Render will auto-load $COUNT farmers on every boot."
echo "=============================================="

rm -f "$UPLOAD"
