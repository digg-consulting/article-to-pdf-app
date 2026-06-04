# Architecture

## Overview

Article-to-PDF is a **local-only** tool with **no server process**. The browser extension communicates directly with a Go binary via Chrome/Firefox Native Messaging. The binary is spawned on demand and exits when done.

```
User clicks extension
        │
        ▼
chrome.runtime.sendNativeMessage("com.digg.articlepdf", { url })
        │  browser spawns binary on demand
        ▼
  Go binary (article-to-pdf-host)
        │  launches headless Chrome via CDP (chromedp)
        │  → navigates to URL
        │  → injects DOM cleanup JS (prepareArticleView)
        │  → Page.printToPDF via CDP
        │  → writes PDF to OS temp dir
        │  → returns { ok: true, path: "/tmp/article-123.pdf" }
        ▼
Extension calls chrome.downloads.download({ url: "file://...", saveAs: true })
        │
        ▼
Native OS Save dialog  ←  user picks download location
```

No port. No `npm start`. No background daemon.

---

## Components

### Native Host — `native-host/main.go`

Single Go binary, compiled with `CGO_ENABLED=0` for a fully static build.

**Responsibilities:**
1. Read one JSON message from stdin (native messaging protocol: 4-byte LE length + JSON)
2. Validate URL (http/https only)
3. Find system Chrome/Chromium
4. Launch Chrome headless via `chromedp`, connect over CDP
5. Navigate to URL, wait for `body`
6. Inject `prepareArticleView` JS — strips nav/footer/modals, scores and extracts main content, applies print-optimised styles
7. Call `Page.printToPDF` (A4, 0.5 in margins, background printing on)
8. Write PDF to `os.TempDir()`
9. Write JSON response to stdout: `{"ok": true, "path": "..."}` or `{"ok": false, "error": "..."}`
10. Exit

**Dependency:** `github.com/chromedp/chromedp` — CDP client. Uses the system Chrome; does not bundle a browser.

### Chrome Extension — `chrome-extension/`

Manifest V3. Extension ID is fixed at **`jfcifebaiplehpcoijaggkhmejmjaafp`**, derived from the RSA public key embedded in `manifest.json` (`key` field). This means the ID is the same for every user who loads the extension, so `install.sh` can hardcode it in the native messaging manifest without any user action.

| File | Role |
|------|------|
| `manifest.json` | Declares `nativeMessaging` permission; contains fixed `key` |
| `popup.html/js` | Toolbar popup — auto-fills current tab URL, sends message to background |
| `background.js` | Service worker — calls `sendNativeMessage`, then `downloads.download({saveAs:true})` |

### Firefox Extension — `firefox-extension/`

Identical structure, uses `browser.*` (Promise-based WebExtensions API). Fixed ID `article-to-pdf@local` set via `browser_specific_settings.gecko.id` in `manifest.json`.

---

## Content Extraction (`prepareArticleView`)

Injected as a JS string via CDP `Runtime.evaluate`:

1. Remove `header`, `nav`, `footer`, `aside`, cookie/consent/modal/newsletter/subscribe banners, fixed-position elements
2. Score candidate containers (`article`, `main`, `[role=main]`, common class names) by text length + (paragraph count × 300) + (image count × 150)
3. Clone the highest-scoring element
4. Strip scripts, styles, forms, buttons, hidden elements
5. Remove all non-essential attributes (keep: `src`, `srcset`, `alt`, `href`, `colspan`, `rowspan`)
6. Replace `document.body` with a clean, print-optimised layout

---

## Distribution

### GitHub Releases

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:
- Cross-compiles `article-to-pdf-host` for: `darwin/amd64`, `darwin/arm64`, `linux/amd64`, `linux/arm64`, `windows/amd64`
- Creates a GitHub Release with the binaries, `install.sh`, and `uninstall.sh` as assets

All third-party actions are pinned to immutable commit SHAs (not tags) to prevent supply-chain attacks.

### Install flow (end user)

```
curl -fsSL .../releases/latest/download/install.sh | bash
```

`install.sh`:
1. Detects OS and CPU architecture
2. Downloads the matching binary from GitHub Releases (falls back to building locally if run from a clone)
3. Places binary in `~/.local/bin/article-to-pdf-host`
4. Writes native messaging manifests for Chrome and Firefox with the hardcoded extension IDs

No Go installation, no `git clone`, no file editing required.

---

## Dependencies

| Component | Dependency | Purpose |
|-----------|-----------|---------|
| Native host | `chromedp` | CDP client — drives Chrome headless |
| Native host | System Chrome/Chromium | Rendering and PDF generation |
| Extension | — | None (plain JS, no build step) |

No Node.js. No npm. No Python. No server.
