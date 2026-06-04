# Contributing

## Setup

```bash
git clone https://github.com/digg-consulting/article-to-pdf-app
cd article-to-pdf-app
./install.sh --dev
```

Load `chrome-extension/` from the repo in `chrome://extensions` (Developer mode → Load unpacked).

## Making changes

| Area | Files | After editing |
|------|-------|---------------|
| Extension UI / cookie relay | `chrome-extension/` | Reload extension in `chrome://extensions` |
| PDF pipeline / extraction | `server/` | Reload extension; restart not needed (host spawns fresh each click) |
| Install / native host registration | `install.sh` | Re-run `./install.sh` or `./install.sh --dev` |

Test with the popup or context menu on a live article. Check `/tmp/article-to-pdf.log` on failure.

For production-like testing (copied install):

```bash
./install.sh
# load ~/.local/share/article-to-pdf/chrome-extension
```

## Branching

- `main` — stable, release-ready
- Feature branches → PR into `main`

## Releasing

```bash
git checkout main
git tag v4.x.x
git push origin v4.x.x
```

Tags trigger a GitHub Release with `chrome-extension.zip`, `server.zip`, `install.sh`, and `uninstall.sh`.
