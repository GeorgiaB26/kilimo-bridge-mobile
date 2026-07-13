#!/usr/bin/env bash
# Build static web app for Netlify. Run from repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies..."
(cd backend && npm install)
(cd mobile && npm install)

echo "==> Linking shared package for Metro..."
ln -sfn ../shared mobile/shared

echo "==> Building web export..."
cd mobile
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3001/api}"
npx expo export --platform web

echo "==> Done. Publish folder: mobile/dist"
