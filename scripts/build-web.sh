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
if [ ! -f mobile/shared/src/regional.ts ]; then
  echo "ERROR: mobile/shared link failed — shared/src must exist at repo root"
  exit 1
fi

echo "==> Building web export..."
cd mobile
if [ -n "${NETLIFY:-}" ] || [ -n "${CI:-}" ]; then
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://kilimo-bridge-mobile.onrender.com/api}"
  echo "API URL: ${EXPO_PUBLIC_API_URL}"
else
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:3001/api}"
fi
npx expo export --platform web

BUILD_TAG=$(grep -oE "v[0-9.]+-[a-z0-9-]+" src/constants/build.ts | head -1)
printf '{"build":"%s","api":"%s","built_at":"%s"}\n' \
  "$BUILD_TAG" \
  "$EXPO_PUBLIC_API_URL" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > dist/version.json
echo "==> version.json: $(cat dist/version.json)"

echo "==> Done. Publish folder: mobile/dist"
