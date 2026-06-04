#!/usr/bin/env bash
# install.sh — installs the Playwright native host and Chrome extension
#
# Usage (from a git clone):
#   ./install.sh
#
# Dev mode — register host from repo paths (no copy to ~/.local/share):
#   ./install.sh --dev
#
# Usage (from a GitHub Release download — install.sh + zips in same folder):
#   ./install.sh
#
# Or download latest release assets automatically:
#   curl -fsSL https://github.com/digg-consulting/article-to-pdf-app/releases/latest/download/install.sh | bash
set -euo pipefail

REPO="digg-consulting/article-to-pdf-app"
HOST_NAME="com.digg.articlepdf"
CHROME_EXT_ID="jfcifebaiplehpcoijaggkhmejmjaafp"
EXTENSIONS_DIR="${EXTENSIONS_DIR:-$HOME/.local/share/article-to-pdf}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$EXTENSIONS_DIR/playwright-browsers}"
DEV_MODE=false

if [[ "${1:-}" == "--dev" ]]; then
  DEV_MODE=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
if [[ -z "$SCRIPT_DIR" || "$SCRIPT_DIR" == "/dev/fd" ]]; then
  SCRIPT_DIR="$(pwd)"
fi

download() {
  local url="$1" dest="$2"
  if command -v curl &>/dev/null; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget &>/dev/null; then
    wget -qO "$dest" "$url"
  else
    echo "Error: curl or wget is required." >&2
    exit 1
  fi
}

BASE_URL="https://github.com/${REPO}/releases/latest/download"

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "Error: Node.js 18+ is required." >&2
  echo "Install from https://nodejs.org or: brew install node" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Error: Node.js 18+ required (found $(node -v))." >&2
  exit 1
fi

# ── Locate or fetch source files ──────────────────────────────────────────────

STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

if [[ "$DEV_MODE" == true ]]; then
  if [[ ! -d "$SCRIPT_DIR/server" || ! -d "$SCRIPT_DIR/chrome-extension" ]]; then
    echo "Error: --dev requires server/ and chrome-extension/ in the repo." >&2
    exit 1
  fi
  SERVER_DIR="$SCRIPT_DIR/server"
  CHROME_EXT_DIR="$SCRIPT_DIR/chrome-extension"
  echo "Dev mode: using repo paths (not copying to $EXTENSIONS_DIR)"
elif [[ -d "$SCRIPT_DIR/server" && -d "$SCRIPT_DIR/chrome-extension" ]]; then
  mkdir -p "$EXTENSIONS_DIR"
  SERVER_DIR="$EXTENSIONS_DIR/server"
  CHROME_EXT_DIR="$EXTENSIONS_DIR/chrome-extension"
  rm -rf "$SERVER_DIR" "$CHROME_EXT_DIR"
  cp -r "$SCRIPT_DIR/server" "$SERVER_DIR"
  cp -r "$SCRIPT_DIR/chrome-extension" "$CHROME_EXT_DIR"
  echo "Installed to $EXTENSIONS_DIR"
elif [[ -f "$SCRIPT_DIR/server.zip" && -f "$SCRIPT_DIR/chrome-extension.zip" ]]; then
  mkdir -p "$EXTENSIONS_DIR"
  unzip -q "$SCRIPT_DIR/server.zip" -d "$STAGING_DIR"
  unzip -q "$SCRIPT_DIR/chrome-extension.zip" -d "$STAGING_DIR"
  SERVER_SRC="$(dirname "$(find "$STAGING_DIR" -path '*/server/host.mjs' | head -1)")"
  CHROME_SRC="$(dirname "$(find "$STAGING_DIR" -path '*/chrome-extension/manifest.json' | head -1)")"
  if [[ -z "$SERVER_SRC" || -z "$CHROME_SRC" ]]; then
    # zips may extract flat
    SERVER_SRC="$(dirname "$(find "$STAGING_DIR" -name host.mjs | head -1)")"
    CHROME_SRC="$(dirname "$(find "$STAGING_DIR" -name manifest.json | head -1)")"
  fi
  SERVER_DIR="$EXTENSIONS_DIR/server"
  CHROME_EXT_DIR="$EXTENSIONS_DIR/chrome-extension"
  rm -rf "$SERVER_DIR" "$CHROME_EXT_DIR"
  cp -r "$SERVER_SRC" "$SERVER_DIR"
  cp -r "$CHROME_SRC" "$CHROME_EXT_DIR"
  echo "Installed from release zips to $EXTENSIONS_DIR"
else
  echo "Downloading latest release..."
  mkdir -p "$EXTENSIONS_DIR"
  download "${BASE_URL}/server.zip" "$STAGING_DIR/server.zip"
  download "${BASE_URL}/chrome-extension.zip" "$STAGING_DIR/chrome-extension.zip"
  unzip -q "$STAGING_DIR/server.zip" -d "$STAGING_DIR/server-unpack"
  unzip -q "$STAGING_DIR/chrome-extension.zip" -d "$STAGING_DIR/chrome-unpack"
  SERVER_SRC="$(dirname "$(find "$STAGING_DIR/server-unpack" -name host.mjs | head -1)")"
  CHROME_SRC="$(dirname "$(find "$STAGING_DIR/chrome-unpack" -name manifest.json | head -1)")"
  if [[ -z "$SERVER_SRC" || -z "$CHROME_SRC" ]]; then
    echo "Error: could not find server/ or chrome-extension/ in release zips." >&2
    exit 1
  fi
  SERVER_DIR="$EXTENSIONS_DIR/server"
  CHROME_EXT_DIR="$EXTENSIONS_DIR/chrome-extension"
  rm -rf "$SERVER_DIR" "$CHROME_EXT_DIR"
  cp -r "$SERVER_SRC" "$SERVER_DIR"
  cp -r "$CHROME_SRC" "$CHROME_EXT_DIR"
  echo "Installed from GitHub release to $EXTENSIONS_DIR"
fi

# ── Install Playwright dependencies ───────────────────────────────────────────

NODE_BIN="$(command -v node)"
chmod +x "$SERVER_DIR/run-host.sh"
# Chrome spawns the host with a minimal PATH — embed absolute node path.
sed -i '' "s|__INSTALL_NODE_PATH__|$NODE_BIN|g" "$SERVER_DIR/run-host.sh" 2>/dev/null \
  || sed -i "s|__INSTALL_NODE_PATH__|$NODE_BIN|g" "$SERVER_DIR/run-host.sh"

export PLAYWRIGHT_BROWSERS_PATH
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"

echo "Installing npm dependencies..."
cd "$SERVER_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "Downloading Playwright Chromium (~170 MB, one time)..."
npx playwright install chromium

# ── Register native messaging manifest ────────────────────────────────────────

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

HOST_SCRIPT="$SERVER_DIR/run-host.sh"
REGISTERED=0
for DIR in "${CHROME_NM_DIRS[@]}"; do
  if [[ -d "$(dirname "$DIR")" ]]; then
    mkdir -p "$DIR"
    cat > "$DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Article to PDF Playwright native host",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${CHROME_EXT_ID}/"]
}
EOF
    REGISTERED=$((REGISTERED + 1))
  fi
done

if [[ "$REGISTERED" -eq 0 ]]; then
  echo "Warning: no Chrome/Chromium config directory found. Open Chrome once, then re-run install.sh." >&2
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "Installation complete."
echo ""
echo "Next steps:"
echo "  1. Open chrome://extensions"
echo "  2. Enable Developer mode"
echo "  3. Load unpacked → $CHROME_EXT_DIR"
echo ""
echo "Usage: click the extension icon or right-click a page → Save page as article PDF"
echo ""
echo "No npm start required — Chrome launches Playwright automatically on each PDF."
echo "Logs: /tmp/article-to-pdf.log"
if [[ "$DEV_MODE" == true ]]; then
  echo ""
  echo "Dev mode: after editing server/ or chrome-extension/, reload the extension in Chrome."
  echo "Re-run ./install.sh --dev only if native host registration needs refreshing."
fi
