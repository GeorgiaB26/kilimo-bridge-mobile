#!/usr/bin/env bash
# Encrypted database backup — run from project root
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$ROOT/backend/data/kilimo.db"
BACKUP_DIR="$ROOT/backend/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/kilimo_${TIMESTAMP}.db"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
  echo "No database found at $DB"
  exit 1
fi

cp "$DB" "$BACKUP_FILE"

# Encrypt backup with openssl AES-256-CBC
KEY="${BACKUP_ENCRYPTION_KEY:-kilimo-bridge-backup-key-change-in-production}"
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$BACKUP_FILE" -out "$ENCRYPTED_FILE" -k "$KEY"
rm "$BACKUP_FILE"

echo "✓ Encrypted backup saved: $ENCRYPTED_FILE"
echo "  To restore: openssl enc -aes-256-cbc -d -pbkdf2 -in $ENCRYPTED_FILE -out kilimo.db -k \$BACKUP_ENCRYPTION_KEY"
