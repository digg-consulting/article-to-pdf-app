# Article to PDF

Save any web article as a clean PDF with one click. A Chrome/Firefox extension backed by a small local Go binary — **no server, no background process**.

## Install

### Step 1 — Install the native helper

**macOS / Linux:**
```bash
curl -fsSL https://github.com/digg-consulting/article-to-pdf-app/releases/latest/download/install.sh | bash
```

This downloads a pre-built binary for your platform, places it in `~/.local/bin`, and registers it as a native messaging host for Chrome and Firefox.

**Windows:** download `install.ps1` from the [latest release](https://github.com/digg-consulting/article-to-pdf-app/releases/latest) and run it in PowerShell.

### Step 2 — Load the extension

Download the extension for your browser from the [latest release](https://github.com/digg-consulting/article-to-pdf-app/releases/latest):
- **Chrome:** `chrome-extension.zip`
- **Firefox:** `firefox-extension.zip`

Unzip the downloaded file, then:

**Chrome / Chromium:**
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the unzipped `chrome-extension/` folder

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** → select `manifest.json` inside the unzipped `firefox-extension/` folder

That's it. No extension ID to copy, no config files to edit.

## Usage

- Click the extension icon → URL is pre-filled from the current tab → **Download PDF**
- Or right-click any page → **Save page as article PDF**
- A native Save dialog lets you choose where to save the file

## Requirements

- macOS or Linux (Windows support coming)
- Google Chrome or Chromium (used for rendering — no extra download)
- No Node.js, no Python, no server

## How it works

When you click the button, the extension sends the URL directly to a local Go binary via [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging). The binary launches Chrome headless, strips navigation/ads/modals, and generates a clean A4 PDF. The binary exits when done — nothing runs in the background. See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Uninstall

```bash
curl -fsSL https://github.com/digg-consulting/article-to-pdf-app/releases/latest/download/uninstall.sh | bash
```

Then remove the extension from `chrome://extensions` (Chrome) or `about:addons` (Firefox).

## Build from source

Requires [Go](https://go.dev/dl/) 1.21+.

```bash
git clone https://github.com/digg-consulting/article-to-pdf-app
cd article-to-pdf-app
./install.sh   # builds locally instead of downloading
```

## Notes

- Some sites block automated rendering
- The binary uses your system Chrome — no separate browser download
- **macOS:** if you downloaded the binary manually (not via `install.sh`), you may need to run `xattr -d com.apple.quarantine ~/.local/bin/article-to-pdf-host` to allow execution
