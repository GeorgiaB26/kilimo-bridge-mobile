#!/usr/bin/env bash
# Verify farmer dashboard returns support contacts (run from repo root)
set -euo pipefail
API="${API_BASE:-http://localhost:3001/api}"

echo "=== Farmer contacts check ==="
echo "API: $API"
echo ""

HEALTH=$(curl -sf "$API/../health" 2>/dev/null || curl -sf "http://localhost:3001/health" 2>/dev/null || true)
if [ -z "$HEALTH" ]; then
  echo "✗ Backend not running. Start: cd backend && npm run dev"
  exit 1
fi
echo "✓ Backend health OK"

LOGIN=$(curl -sf -X POST "$API/auth/dev-login" -H 'Content-Type: application/json' -d '{"phone":"+254712345678"}' 2>/dev/null || true)
if [ -z "$LOGIN" ]; then
  echo "✗ Dev login failed — set PILOT_OTP=true in backend/.env"
  exit 1
fi

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  echo "✗ No token from dev-login"
  echo "$LOGIN"
  exit 1
fi
echo "✓ Demo farmer logged in"

DASH=$(curl -sf "$API/farmer/dashboard" -H "Authorization: Bearer $TOKEN")
echo ""
echo "$DASH" | python3 -c "
import sys, json
d = json.load(sys.stdin)
c = d.get('contacts') or {}
f = d.get('farmer') or {}
print('contacts.fieldAgent:', c.get('fieldAgent'))
print('contacts.aggregationCentre:', c.get('aggregationCentre'))
print('contacts.bankingAgent:', c.get('bankingAgent'))
print('farmer.aggregation_center:', f.get('aggregation_center'))
print('farmer.registered_agent_name:', f.get('registered_agent_name'))
if not c.get('fieldAgent') and not f.get('registered_agent_name'):
    print('')
    print('✗ No field agent on dashboard — restart backend after git pull')
    sys.exit(1)
print('')
print('✓ Support contacts present')
" || exit 1
