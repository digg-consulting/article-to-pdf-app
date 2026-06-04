#!/usr/bin/env bash
# Wrapper so Chrome native messaging can launch the Playwright host.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.local/share/article-to-pdf/playwright-browsers}"
exec node "$DIR/host.mjs" 2>>/tmp/article-to-pdf.log
