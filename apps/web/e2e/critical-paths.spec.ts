import { test, expect, type Page } from '@playwright/test';

// Critical-path E2E coverage: validates that the buy/sell flow's key
// surfaces exist and behave on a cold session, complementing smoke.spec.ts
// (which only checks public pages render). These tests use loose,
// role/aria-based selectors so copy iteration won't break them. Auth'd
// flows are gated behind the `E2E_AUTH=1` env var so the default CI run
// still works without a fixture user — once the auth fixture lands in a
// follow-up, set E2E_AUTH=1 in CI to enable the full suite.

const requireAuth = process.env.E2E_AUTH === '1';

// `/auth/login` is a `'use client'` page: Next.js renders SSR HTML first and
// React hydrates asynchronously. waitForSelector / getByLabel only check
// DOM presence — neither blocks until React has attached its onSubmit
// handler. Submitting the form before hydration completes drops the event
// into the void: noValidate=true skips HTML5, no React listener catches the
// `submit` event, the form posts natively (GET to the same URL), the page
// rerenders empty, and the assertion times out. Two prior fix attempts
// kept the requestSubmit() shape and only retuned the waits, so CI kept
// flaking. This helper waits for React's __reactFiber$ internal property
// to appear on the form node — the canonical post-hydration signal in
// React 18+ — before the test touches anything.
async function waitForLoginFormHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const form = document.querySelector('form');
    if (!form) return false;
    return Object.keys(form).some((k) => k.startsWith('__reactFiber'));
  }, undefined, { timeout: 15_000 });
}

test.describe('login form — client-side validation', () => {
  // The empty-fields case lives in apps/web/src/app/__tests__/login.spec.tsx
  // as a jsdom test. Three Playwright attempts (c637866, 5f79f87, 90245c3)
  // failed to get Chrome's submit-event flow to reach React's onSubmit when
  // every required input was empty — even after stripping `required`,
  // swapping `type="email"` to `text`, and setting `form.noValidate = true`.
  // The validation logic itself is pure React state + validateLoginForm, so
  // a jsdom unit test gives the same coverage without the HTML5/React
  // event-cascade flake. The non-empty case below stays here because it
  // exercises the full hydrated React click cascade in a real browser,
  // which is the part jsdom doesn't cover.
  test('a too-short password surfaces "A senha tem no mínimo 8 caracteres"', async ({ page }) => {
    // Valid email + 5-char password → passes HTML5 (both required fields are
    // non-empty, email type-checks), trips validateLoginForm's password rule.
    await page.goto('/auth/login');
    await waitForLoginFormHydration(page);
    await page.getByLabel('E-mail').fill('user@example.com');
    await page.getByLabel('Senha').fill('short');
    await page.getByRole('button', { name: /^entrar$/i }).click();
    await expect(page.getByText(/no mínimo 8 caracteres/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('protected route auth gate', () => {
  // Middleware redirects unauthenticated traffic to /auth/login?next=...
  // The smoke test already covers /promotions/* paths; here we cover the
  // primary mutation-bearing routes.
  for (const path of ['/sell', '/messages', '/orders', '/wallet', '/conta/perfil']) {
    test(`${path} redirects unauthenticated users to login with next param`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login\?next=/);
    });
  }
});

test.describe('public marketing pages stay public', () => {
  // The middleware (apps/web/src/middleware.ts) allowlists every marketing
  // / legal / help path. Hitting one unauthenticated must NOT redirect to
  // /auth/login. We use /sobre because it's a server-rendered page with
  // zero API dependency — the listings index does client-side fetching
  // and would flake in a CI env where the NestJS API isn't running.
  for (const path of ['/sobre', '/about', '/help', '/privacidade']) {
    test(`${path} is reachable without authentication`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status() ?? 0).toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/auth\/login/);
    });
  }
});

// ----- Auth'd critical paths -----
//
// These tests need a logged-in fixture session. To run locally:
//   E2E_AUTH=1 E2E_TEST_USER=test@vintage.br E2E_TEST_PASS='...' npm run test:e2e
// In CI they are skipped until the fixture-user provisioning step is wired
// into the workflow (tracked as a follow-up to PENTEST_FOLLOWUPS.md).

test.describe('authed flows (E2E_AUTH=1)', () => {
  test.skip(!requireAuth, 'Set E2E_AUTH=1 with E2E_TEST_USER + E2E_TEST_PASS to run');

  test('login → /sell renders the form', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').first().fill(process.env.E2E_TEST_USER ?? '');
    await page.locator('input[type="password"]').first().fill(process.env.E2E_TEST_PASS ?? '');
    await page.getByRole('button', { name: /entrar|login/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 15_000 });
    await page.goto('/sell');
    await expect(page.getByLabel(/título|titulo/i)).toBeVisible();
    await expect(page.getByLabel(/preço|preco/i)).toBeVisible();
  });

  test('orders page renders for an authed user', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('input[type="email"]').first().fill(process.env.E2E_TEST_USER ?? '');
    await page.locator('input[type="password"]').first().fill(process.env.E2E_TEST_PASS ?? '');
    await page.getByRole('button', { name: /entrar|login/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 15_000 });
    await page.goto('/orders');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});
