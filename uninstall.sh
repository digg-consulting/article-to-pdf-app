#!/usr/bin/env bash
# uninstall.sh — removes the Playwright host, extension copy, and native messaging manifests
set -euo pipefail

HOST_NAME="com.digg.articlepdf"
EXTENSIONS_DIR="${EXTENSIONS_DIR:-$HOME/.local/share/article-to-pdf}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [[ "$OS" == "darwin" ]]; then
  CHROME_NM_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  )
else
  CHROME_NM_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
  )
fi

for DIR in "${CHROME_NM_DIRS[@]}"; do
  MANIFEST="$DIR/$HOST_NAME.json"
  if [[ -f "$MANIFEST" ]]; then
    rm -f "$MANIFEST"
    echo "Removed $MANIFEST"
  fi
done

if [[ -d "$EXTENSIONS_DIR" ]]; then
  rm -rf "$EXTENSIONS_DIR"
  echo "Removed $EXTENSIONS_DIR (extension copy, server, Playwright browsers)"
else
  echo "Nothing installed at $EXTENSIONS_DIR"
fi

echo ""
echo "Remove the extension from chrome://extensions if still loaded."
