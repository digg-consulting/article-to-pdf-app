# Contributing

## Branching

- `main` — stable, release-ready code. Tags trigger releases.
- Feature/fix branches — branch from `main`, PR back into `main`.

```
git checkout -b feature/my-change
# make changes
git push -u origin feature/my-change
# open PR → merge to main
```

## Releasing

```bash
git checkout main
git tag v1.x.x
git push origin v1.x.x
```

This triggers the CI workflow which builds binaries and publishes a GitHub Release.

## Local development

```bash
cd native-host
go build -o article-to-pdf-host .
cp article-to-pdf-host ~/.local/bin/
```

Then reload the extension in Chrome (`chrome://extensions` → ↻).
