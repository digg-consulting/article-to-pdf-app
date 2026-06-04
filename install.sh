#!/usr/bin/env bash
# install.sh — installs the article-to-pdf native messaging host and extensions
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
EXTENSIONS_DIR="${EXTENSIONS_DIR:-$HOME/.local/share/article-to-pdf}"
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

download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget &>/dev/null; then
    wget -qO "$dest" "$url"
  else
    echo "Error: curl or wget is required."; exit 1
  fi
}

BASE_URL="https://github.com/${REPO}/releases/latest/download"

# ── 2. Install binary ─────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"
BINARY_PATH="$INSTALL_DIR/$BINARY_NAME"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-/dev/stdin}")" 2>/dev/null && pwd || echo "")"
LOCAL_BINARY="$SCRIPT_DIR/native-host/$BINARY_NAME"

if [[ -f "$LOCAL_BINARY" ]]; then
  cp "$LOCAL_BINARY" "$BINARY_PATH"
else
  echo "Downloading ${BINARY_NAME}-${OS}-${ARCH}..."
  download "${BASE_URL}/${BINARY_NAME}-${OS}-${ARCH}" "$BINARY_PATH"
fi

chmod +x "$BINARY_PATH"

# macOS: remove quarantine and ad-hoc sign so Gatekeeper/App Management doesn't block execution
if [[ "$OS" == "darwin" ]]; then
  xattr -cr "$BINARY_PATH" 2>/dev/null || true
  codesign --force --sign - "$BINARY_PATH" 2>/dev/null || true
fi

# ── 3. Install extensions ─────────────────────────────────────────────────────

mkdir -p "$EXTENSIONS_DIR"

CHROME_EXT_DIR="$EXTENSIONS_DIR/chrome-extension"
FIREFOX_EXT_DIR="$EXTENSIONS_DIR/firefox-extension"

if [[ -d "$SCRIPT_DIR/chrome-extension" ]]; then
  cp -r "$SCRIPT_DIR/chrome-extension" "$CHROME_EXT_DIR"
  cp -r "$SCRIPT_DIR/firefox-extension" "$FIREFOX_EXT_DIR"
else
  echo "Downloading extensions..."
  TMP_DIR="$(mktemp -d)"
  download "${BASE_URL}/chrome-extension.zip"  "$TMP_DIR/chrome-extension.zip"
  download "${BASE_URL}/firefox-extension.zip" "$TMP_DIR/firefox-extension.zip"
  unzip -q "$TMP_DIR/chrome-extension.zip"  -d "$TMP_DIR/chrome"
  unzip -q "$TMP_DIR/firefox-extension.zip" -d "$TMP_DIR/firefox"
  # unzip may produce a subdirectory; find the one with manifest.json
  CHROME_SRC="$(dirname "$(find "$TMP_DIR/chrome"  -name manifest.json | head -1)")"
  FIREFOX_SRC="$(dirname "$(find "$TMP_DIR/firefox" -name manifest.json | head -1)")"
  rm -rf "$CHROME_EXT_DIR" "$FIREFOX_EXT_DIR"
  cp -r "$CHROME_SRC"  "$CHROME_EXT_DIR"
  cp -r "$FIREFOX_SRC" "$FIREFOX_EXT_DIR"
  rm -rf "$TMP_DIR"
fi

# ── 4. Register native messaging manifests ────────────────────────────────────

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

for DIR in "${CHROME_NM_DIRS[@]}"; do
  if [[ -d "$(dirname "$DIR")" ]]; then
    mkdir -p "$DIR"
    cat > "$DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Article to PDF native messaging host",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${CHROME_EXT_ID}/"]
}
EOF
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

# ── 5. Done ───────────────────────────────────────────────────────────────────

echo ""
echo "Installation complete. Load the extension in your browser:"
echo ""
echo "  Chrome:  chrome://extensions → Enable Developer mode → Load unpacked → $CHROME_EXT_DIR"
echo "  Firefox: about:debugging → Load Temporary Add-on → $FIREFOX_EXT_DIR/manifest.json"
