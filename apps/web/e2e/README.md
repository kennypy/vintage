# Web E2E — Playwright smoke tests

## What's here

Smoke tests that prove the key public routes render without a crash and
that unauthenticated users are redirected away from gated pages. They
run against a local Next.js dev server (auto-started by Playwright's
`webServer` config when nothing is listening on :3000).

They intentionally do **not** exercise authenticated flows. Those
require fixture users + API mocks and are a follow-up.

## Running locally

```bash
# One-time: download the Chromium binary used by Playwright
npx playwright install chromium

# Run the full smoke suite headless
npm -w @vintage/web run test:e2e

# Interactive UI mode (re-runs on change, trace viewer)
npm -w @vintage/web run test:e2e:ui
```

The config sets `webServer: npm run dev`, so Playwright will boot the
dev server automatically. If you already have `npm run dev` running it
reuses it (`reuseExistingServer` is on outside CI).

## Running in CI

```bash
# In CI, install deps and the browser with system libs.
npx playwright install --with-deps chromium
npm -w @vintage/web run test:e2e
```

The `ci-parity.sh` script runs `test:e2e` when Chromium is present and
skips with a warning when it isn't — so local runs on a fresh checkout
don't break just because the binary hasn't been installed yet.

## Adding a new test

Put the spec next to `smoke.spec.ts`. Prefer role/type selectors over
copy text so marketing changes don't break the suite. Avoid hard-coded
sleeps — use `expect(locator).toBeVisible()` with its built-in retry.
