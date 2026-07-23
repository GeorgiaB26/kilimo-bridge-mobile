#!/usr/bin/env bash
# Generate client PDF from docs/FARMER_IMPORT_GUIDE.md
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="docs/Kilimo-Bridge-Farmer-Import-Guide.pdf"
echo "Generating $OUT ..."
npx --yes md-to-pdf docs/FARMER_IMPORT_GUIDE.md
mv docs/FARMER_IMPORT_GUIDE.pdf "$OUT" 2>/dev/null || cp docs/FARMER_IMPORT_GUIDE.pdf "$OUT"
echo "Done: $OUT"
