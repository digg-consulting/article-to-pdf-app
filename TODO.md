# TODO

---

## Native Host

- [ ] **Lazy-image scroll before print** — port the scroll-and-wait-for-images logic from the original server: scroll the page to trigger lazy-loaded images, wait for `img.complete && naturalWidth > 0`, then print.
- [ ] **Configurable PDF options** — format, margins, and scale are hardcoded to A4 / 0.5 in / 1.0. Accept optional fields in the incoming JSON message so the extension can expose a settings panel.
- [ ] **Navigation timeout config** — 60 s is hardcoded. Read from `~/.config/article-to-pdf/config.json` or an env var.
- [ ] **Windows support** — add `install.ps1` and verify the Chrome path candidates in `findChrome()` cover all common Windows install locations.

## Extension

- [ ] **"Host not installed" error** — `sendNativeMessage` returns a generic `lastError` when the host isn't registered. Detect it and show a message linking to the install instructions.
- [ ] **PDF options UI** — once the host supports configurable options, add a settings panel to the popup.
- [ ] **Store listing** — submit to Chrome Web Store and Firefox Add-ons. The `key` field in the Chrome manifest will preserve the fixed ID after store publication.

## CI / Release

- [ ] **`go vet` / `staticcheck` on PR** — add a second workflow that runs on pull requests (not just tags).
- [ ] **Checksum file** — publish a `checksums.txt` (SHA-256) alongside the release binaries so `install.sh` can verify integrity before executing.

## Testing

- [ ] **Go integration test** — start a local HTTP server serving a fixture HTML page, run the full `generatePDF` pipeline, assert the output starts with `%PDF-`.
