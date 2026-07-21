#!/usr/bin/env bash
# One-command local startup: backend + hierarchy seed + mobile web
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "============================================"
echo "  Kilimo Bridge — Load Up"
echo "============================================"
echo ""

if [ -d "$HOME/.nvm" ] && [ -f "$ROOT/.nvmrc" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" 2>/dev/null || true
  if command -v nvm >/dev/null 2>&1; then
    nvm use 2>/dev/null || nvm install 2>/dev/null || true
  fi
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -ge 23 ] 2>/dev/null; then
  echo "⚠️  Node v$NODE_MAJOR detected. Node 20 LTS is recommended."
  echo "   Install: nvm install 20 && nvm use 20"
  echo ""
fi

if [ ! -d backend/node_modules ]; then
  echo "Installing backend..."
  (cd backend && npm install)
fi
if [ ! -d mobile/node_modules ]; then
  echo "Installing mobile..."
  (cd mobile && npm install)
fi

for PORT in 3001 8081; do
  if lsof -ti:"$PORT" >/dev/null 2>&1; then
    echo "Freeing port $PORT..."
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

echo ""
echo "Starting backend (seeds demo hierarchy on first boot)..."
(cd backend && npm run dev) &
BACKEND_PID=$!
sleep 3

if ! curl -sf http://localhost:3001/health >/dev/null; then
  echo "✗ Backend failed to start. Check Terminal output above."
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi

echo "✓ Backend: http://localhost:3001"
curl -s http://localhost:3001/health
echo ""
echo ""

echo "Starting mobile web..."
echo "→ Open http://localhost:8081 when Expo says 'Web Bundled'"
echo "→ Login: Admin +254700000002 / OTP 123456"
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd mobile
npx expo start --web --clear --port 8081
