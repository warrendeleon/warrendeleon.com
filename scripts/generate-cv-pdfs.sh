#!/usr/bin/env bash
# Regenerate the per-locale CV PDFs from src/data/cv-*.json and drop them in
# public/pdf/. Run after the CV copy changes so the downloads stay in sync with
# the web CV. Requires Google Chrome (used headless for HTML -> PDF).
#
#   bash scripts/generate-cv-pdfs.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (set CHROME=...)"; exit 1; }

mkdir -p .cv-pdf-build
node scripts/generate-cv-pdfs.mjs

for loc in en es ca tl; do
  case "$loc" in
    en) out="CV_WARRENDELEON_2026.pdf" ;;
    *)  out="CV_WARRENDELEON_2026_$(printf '%s' "$loc" | tr '[:lower:]' '[:upper:]').pdf" ;;
  esac
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=6000 \
    --print-to-pdf=".cv-pdf-build/cv-$loc.pdf" ".cv-pdf-build/cv-$loc.html" 2>/dev/null
  cp ".cv-pdf-build/cv-$loc.pdf" "public/pdf/$out"
  echo "generated public/pdf/$out"
done
