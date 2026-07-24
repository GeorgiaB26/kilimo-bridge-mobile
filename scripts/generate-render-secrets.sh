#!/usr/bin/env bash
# Print values to paste into Render → Environment (do not commit output).
set -euo pipefail
echo ""
echo "Paste these into Render → Environment:"
echo ""
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo ""
echo "Remove any old values that look like '<run: openssl ...>'"
echo ""
