# Article to PDF

Save any web article as a clean PDF with one click. A Chrome extension plus a Playwright native host — **no `npm start`, no background server**.

The extension extracts the article body (not the full page), strips nav/ads/comments, and prints an A4 PDF. Authenticated sites work: your Chrome cookies are passed to Playwright before rendering.

## Requirements

- **Google Chrome** or Chromium
- **Node.js 18+** (for the Playwright host — installed once, never run manually)
- macOS or Linux

## Install

### From a git clone

```bash
git clone https://github.com/digg-consulting/article-to-pdf-app
cd article-to-pdf-app
./install.sh
```

### From a GitHub Release

Download `install.sh`, `server.zip`, and `chrome-extension.zip` from the [latest release](https://github.com/digg-consulting/article-to-pdf-app/releases/latest), then:

```bash
./install.sh
```

Or let the script fetch the latest release automatically:

```bash
curl -fsSL https://github.com/digg-consulting/article-to-pdf-app/releases/latest/download/install.sh | bash
```

### Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the path printed by `install.sh` (default: `~/.local/share/article-to-pdf/chrome-extension`)

You never run `npm start`. Chrome launches Playwright automatically when you click Download.

## Usage

- **Popup:** click the extension icon → URL is pre-filled from the current tab → **Download PDF**
- **Context menu:** right-click any page → **Save page as article PDF**
- A native Save dialog lets you choose where to save the file

## How it works

```
Extension click
  → chrome.cookies.getAll({ url })          # your session cookies
  → chrome.runtime.sendNativeMessage(...) # Chrome spawns the host
  → Playwright headless Chromium            # bundled, not Google Chrome.app
  → navigate → scroll → extract article → PDF
  → one-shot localhost download URL
  → host exits
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Project layout

```
article-to-pdf-app/
├── chrome-extension/     # Chrome extension (load unpacked)
│   ├── manifest.json
│   ├── background.js     # cookies + native messaging + download
│   └── popup.html/js     # toolbar popup UI
├── server/               # Playwright native messaging host
│   ├── run-host.sh       # entry point Chrome executes
│   ├── host.mjs          # native messaging protocol
│   ├── generate-pdf.mjs  # Playwright PDF pipeline
│   └── prepare-article.mjs  # article extraction scripts
├── install.sh            # one-time setup
└── uninstall.sh
```

## Development

Active development on the repo without copying to `~/.local/share`:

```bash
./install.sh --dev
```

Then load `chrome-extension/` from the repo in `chrome://extensions`. After editing files, reload the extension. Re-run `./install.sh --dev` only if native host registration needs refreshing.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## Uninstall

```bash
./uninstall.sh
```

Also remove the extension from `chrome://extensions`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Specified native messaging host not found" | Run `./install.sh` (or `./install.sh --dev`). Open Chrome once before installing so config dirs exist. |
| "Error: Node.js 18+ is required" | Install Node: `brew install node` |
| PDF missing paid/subscriber content | Make sure you are logged into the site in Chrome. Cookies are read at click time. |
| PDF cuts off early | Check `/tmp/article-to-pdf.log`. Some sites block headless browsers despite valid cookies. |
| Slow first PDF | Normal — Playwright launches Chromium (~5–7 s). Each click starts a fresh browser. |

Logs: `/tmp/article-to-pdf.log`

## Notes

- Playwright uses its own bundled Chromium — avoids macOS App Management issues with `Google Chrome.app`
- Article extraction is heuristic; some sites may include or exclude unexpected sections
- Chrome-only (no Firefox support)
