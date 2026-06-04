# Architecture

## Overview

Article-to-PDF is a **Chrome extension** plus a **Playwright native messaging host**. Chrome spawns the host on demand when you click Download. There is no `npm start`, no port, and no background daemon.

```
User clicks extension or context menu
        │
        ▼
  background.js
        │  chrome.cookies.getAll({ url })
        │  chrome.runtime.sendNativeMessage("com.digg.articlepdf", { url, cookies })
        │  Chrome spawns server/run-host.sh → node host.mjs
        ▼
  Playwright headless Chromium (bundled)
        │  inject cookies → navigate → wait for content
        │  scroll for lazy images → prepareArticleJS
        │  page.pdf() → A4
        │  serve PDF via one-shot http://127.0.0.1:<port>/
        ▼
  chrome.downloads.download({ url, saveAs: true })
        │
        ▼
  host process exits (~30 s after response)
```

---

## Repository layout

| Path | Purpose |
|------|---------|
| `chrome-extension/` | Manifest V3 extension — UI, cookies, native messaging client |
| `server/` | Node/Playwright native messaging host |
| `install.sh` | Copies files, runs `npm ci`, `playwright install chromium`, registers native host |
| `uninstall.sh` | Removes `~/.local/share/article-to-pdf` and native messaging manifests |

Installed artifacts (default locations):

| Artifact | Path |
|----------|------|
| Extension copy | `~/.local/share/article-to-pdf/chrome-extension/` |
| Playwright host | `~/.local/share/article-to-pdf/server/` |
| Playwright Chromium | `~/.local/share/article-to-pdf/playwright-browsers/` |
| Native messaging manifest | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.digg.articlepdf.json` (macOS) |

---

## Chrome extension

Fixed extension ID: **`jfcifebaiplehpcoijaggkhmejmjaafp`** (RSA `key` in `manifest.json`). This ID is hardcoded in the native messaging manifest so `install.sh` works without per-user configuration.

| File | Role |
|------|------|
| `manifest.json` | Permissions: `nativeMessaging`, `cookies`, `downloads`, `contextMenus`, `host_permissions` |
| `background.js` | Reads cookies, sends native message, triggers download |
| `popup.html/js` | Pre-fills current tab URL, sends `{ type: "download", url }` |

---

## Playwright native host

| File | Role |
|------|------|
| `run-host.sh` | Wrapper Chrome executes; sets `PLAYWRIGHT_BROWSERS_PATH`, runs `host.mjs` |
| `host.mjs` | Chrome Native Messaging protocol (4-byte LE length + JSON on stdin/stdout) |
| `generate-pdf.mjs` | Launches Playwright, injects cookies, generates PDF |
| `prepare-article.mjs` | Article extraction and scroll scripts (evaluated in page context) |

### Native messaging protocol

**Request** (extension → host):

```json
{ "url": "https://example.com/article", "cookies": [ /* chrome.cookies objects */ ] }
```

**Response** (host → extension):

```json
{ "ok": true, "url": "http://127.0.0.1:12345/article.pdf", "filename": "article.pdf" }
```

```json
{ "ok": false, "error": "message" }
```

Large PDFs are served via a one-shot localhost HTTP server to avoid Chrome's ~1 MB native messaging limit.

Playwright uses **bundled Chromium**, not the user's `Google Chrome.app`, avoiding macOS App Management prompts.

---

## Content extraction

`prepare-article.mjs` exports three scripts injected via Playwright `page.evaluate`:

1. **Wait for content** — polls text length until async content (Substack, Medium) stops growing
2. **Scroll for images** — scrolls the page to trigger lazy-loaded images
3. **Prepare article** — scores content containers, clones the best match, strips nav/ads/comments/share blocks, rebuilds a print-friendly page

---

## Authentication

The extension calls `chrome.cookies.getAll({ url })` and passes the result to the native host. Playwright injects cookies into a fresh browser context before `page.goto()`. HttpOnly session cookies are included.

This enables Substack paid posts and similar authenticated content without tab duplication or sharing Chrome's profile directory.

---

## Install modes

| Command | Behavior |
|---------|----------|
| `./install.sh` | Copy to `~/.local/share/article-to-pdf/`, install deps, register native host |
| `./install.sh --dev` | Register native host pointing at repo `server/`; load extension from repo directly |
| `curl …/install.sh \| bash` | Download latest release assets and install |

---

## Dependencies

| Component | Dependency | Purpose |
|-----------|-----------|---------|
| Host | Node.js 18+ | Runtime |
| Host | Playwright | Headless Chromium + PDF |
| Extension | Chrome APIs | Cookies, native messaging, downloads |

No Go. No Firefox. No long-running server.

---

## Release

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which publishes:

- `chrome-extension.zip`
- `server.zip`
- `install.sh`
- `uninstall.sh`
