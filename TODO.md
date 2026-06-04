# TODO

---

## Extraction

- [ ] **Site-specific selectors** — tune `server/prepare-article.mjs` for sites you use often
- [ ] **PDF options UI** — format, margins, and scale are hardcoded to A4; expose in popup if needed

## Performance

- [ ] **Reuse browser across requests** — keep Playwright browser warm in a long-lived native host process to avoid ~5 s launch per PDF

## CI

- [ ] **Lint** — ESLint for extension JS; `node --check` on server `.mjs` files in PR workflow
