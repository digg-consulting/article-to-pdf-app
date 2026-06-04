#!/usr/bin/env bash
# uninstall.sh — removes the article-to-pdf native messaging host
set -euo pipefail

HOST_NAME="com.digg.articlepdf"
BINARY_PATH="${INSTALL_DIR:-$HOME/.local/bin}/article-to-pdf-host"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

if [[ "$OS" == "darwin" ]]; then
  CHROME_NM_DIRS=(
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  )
  FIREFOX_NM_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
else
  CHROME_NM_DIRS=(
    "$HOME/.config/google-chrome/NativeMessagingHosts"
    "$HOME/.config/chromium/NativeMessagingHosts"
  )
  FIREFOX_NM_DIR="$HOME/.mozilla/native-messaging-hosts"
fi

# Remove binary
if [[ -f "$BINARY_PATH" ]]; then
  rm -f "$BINARY_PATH"
  echo "Removed $BINARY_PATH"
else
  echo "Binary not found at $BINARY_PATH (already removed?)"
fi

# Remove Chrome/Chromium manifests
for DIR in "${CHROME_NM_DIRS[@]}"; do
  MANIFEST="$DIR/$HOST_NAME.json"
  if [[ -f "$MANIFEST" ]]; then
    rm -f "$MANIFEST"
    echo "Removed $MANIFEST"
  fi
done

# Remove Firefox manifest
MANIFEST="$FIREFOX_NM_DIR/$HOST_NAME.json"
if [[ -f "$MANIFEST" ]]; then
  rm -f "$MANIFEST"
  echo "Removed $MANIFEST"
fi

echo ""
echo "Uninstall complete."
echo "Remember to remove the extension from chrome://extensions and about:addons."
