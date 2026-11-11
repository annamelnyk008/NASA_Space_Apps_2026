#!/bin/bash
# Rebuild js/app.js from the split sources in js/src/
set -e
cd "$(dirname "$0")"
{
  echo "(function () {"
  echo "  'use strict';"
  echo ""
  cat js/src/01-solar-system.js
  cat js/src/02-mars.js
  cat js/src/03-surface.js
  cat js/src/04-loop.js
  echo "})();"
} > js/app.js
echo "Built js/app.js ($(wc -l < js/app.js) lines)"
