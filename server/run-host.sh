#!/usr/bin/env bash
# Wrapper Chrome executes for native messaging.
# install.sh embeds the absolute node path — Chrome's PATH does not include Homebrew.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.local/share/article-to-pdf/playwright-browsers}"

NODE_BIN="__INSTALL_NODE_PATH__"

if [[ ! -x "$NODE_BIN" ]]; then
  for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin/node"; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
      break
    fi
  done
  if [[ ! -x "$NODE_BIN" ]]; then
    NODE_BIN="$(command -v node 2>/dev/null || true)"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "article-to-pdf: node not found at $NODE_BIN — re-run install.sh" >> /tmp/article-to-pdf.log
  exit 1
fi

exec "$NODE_BIN" "$DIR/host.mjs" 2>>/tmp/article-to-pdf.log
