#!/usr/bin/env bash
# Share Kilimo Bridge with a client in ~5 minutes — no Render/Netlify needed.
# Your Mac runs the app; ngrok gives a public link.
#
# Prerequisites (one-time):
#   brew install ngrok
#   ngrok config add-authtoken YOUR_TOKEN   # free at https://ngrok.com
#
# Usage:
#   bash scripts/share-demo.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install: brew install ngrok"
  echo "Then sign up free at https://ngrok.com and run: ngrok config add-authtoken YOUR_TOKEN"
  exit 1
fi

echo "==> Starting backend on port 3001..."
(cd backend && npm run dev) &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$NGROK_API_PID" 2>/dev/null || true
  kill "$NGROK_WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 3

echo "==> Starting API tunnel (ngrok)..."
ngrok http 3001 --log=stdout > /tmp/kb-ngrok-api.log 2>&1 &
NGROK_API_PID=$!
sleep 4

API_URL=""
for _ in $(seq 1 20); do
  API_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || true)
  [ -n "$API_URL" ] && break
  sleep 1
done

if [ -z "$API_URL" ]; then
  echo "Could not get ngrok API URL. Is ngrok running? Check /tmp/kb-ngrok-api.log"
  exit 1
fi

echo "    API tunnel: $API_URL"

echo "==> Starting web app (Expo) on port 8081..."
export EXPO_PUBLIC_API_URL="${API_URL}/api"
(cd mobile && npx expo start --web --port 8081) &
WEB_PID=$!
sleep 8

echo "==> Starting web tunnel (ngrok on port 4041)..."
ngrok http 8081 --log=stdout --web-addr=127.0.0.1:4041 > /tmp/kb-ngrok-web.log 2>&1 &
NGROK_WEB_PID=$!
sleep 4

WEB_URL=""
for _ in $(seq 1 20); do
  WEB_URL=$(curl -s http://127.0.0.1:4041/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || true)
  [ -n "$WEB_URL" ] && break
  sleep 1
done

echo ""
echo "=============================================="
echo "  SHARE THIS LINK WITH YOUR CLIENT:"
echo "  $WEB_URL"
echo ""
echo "  Login: +254700000002"
echo "  OTP:   123456"
echo "=============================================="
echo ""
echo "Keep this terminal open while the client tests."
echo "Press Ctrl+C to stop."

wait "$WEB_PID"
