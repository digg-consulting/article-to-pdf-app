#!/usr/bin/env bash
# install.sh — installs the article-to-pdf native messaging host
#
# Usage (one-liner):
#   curl -fsSL https://github.com/digg-consulting/article-to-pdf-app/releases/latest/download/install.sh | bash
#
# Or after cloning:
#   ./install.sh
set -euo pipefail

REPO="digg-consulting/article-to-pdf-app"
HOST_NAME="com.digg.articlepdf"
BINARY_NAME="article-to-pdf-host"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
CHROME_EXT_ID="jfcifebaiplehpcoijaggkhmejmjaafp"
FIREFOX_EXT_ID="article-to-pdf@local"

# ── 1. Detect OS / arch ───────────────────────────────────────────────────────

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS. Use install.ps1 on Windows."; exit 1 ;;
esac

ASSET_NAME="${BINARY_NAME}-${OS}-${ARCH}"

# ── 2. Download binary ────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
BINARY_PATH="$INSTALL_DIR/$BINARY_NAME"

# If running from a local clone and the binary exists, use it directly.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/dev/stdin}")" 2>/dev/null && pwd || echo "")"
LOCAL_BINARY="$SCRIPT_DIR/native-host/$BINARY_NAME"

if [[ -f "$LOCAL_BINARY" ]]; then
  echo "Using local binary: $LOCAL_BINARY"
  cp "$LOCAL_BINARY" "$BINARY_PATH"
else
  echo "Downloading $ASSET_NAME from GitHub Releases..."
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"

  if command -v curl &>/dev/null; then
    curl -fsSL "$DOWNLOAD_URL" -o "$BINARY_PATH"
  elif command -v wget &>/dev/null; then
    wget -qO "$BINARY_PATH" "$DOWNLOAD_URL"
  else
    echo "Error: curl or wget is required."; exit 1
  fi
fi

chmod +x "$BINARY_PATH"
echo "  → installed to $BINARY_PATH"

# ── 3. Write native messaging manifests ──────────────────────────────────────

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

CHROME_MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Article to PDF native messaging host",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${CHROME_EXT_ID}/"]
}
EOF
)

for DIR in "${CHROME_NM_DIRS[@]}"; do
  if [[ -d "$(dirname "$DIR")" ]]; then
    mkdir -p "$DIR"
    echo "$CHROME_MANIFEST" > "$DIR/$HOST_NAME.json"
    echo "  → Chrome/Chromium manifest: $DIR/$HOST_NAME.json"
  fi
done

mkdir -p "$FIREFOX_NM_DIR"
cat > "$FIREFOX_NM_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Article to PDF native messaging host",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_extensions": ["$FIREFOX_EXT_ID"]
}
EOF
echo "  → Firefox manifest: $FIREFOX_NM_DIR/$HOST_NAME.json"

# ── 4. Done ───────────────────────────────────────────────────────────────────

echo ""
echo "Installation complete."
echo ""
echo "Next steps:"
echo "  Chrome:  Open chrome://extensions → Load unpacked → select chrome-extension/"
echo "  Firefox: Open about:debugging → Load Temporary Add-on → select firefox-extension/manifest.json"
echo ""
echo "No further configuration needed — the extension ID is fixed."
