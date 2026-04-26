import { test, expect } from '@playwright/test';

// Critical-path E2E coverage: validates that the buy/sell flow's key
// surfaces exist and behave on a cold session, complementing smoke.spec.ts
// (which only checks public pages render). These tests use loose,
// role/aria-based selectors so copy iteration won't break them. Auth'd
// flows are gated behind the `E2E_AUTH=1` env var so the default CI run
// still works without a fixture user — once the auth fixture lands in a
// follow-up, set E2E_AUTH=1 in CI to enable the full suite.

const requireAuth = process.env.E2E_AUTH === '1';

test.describe('login form — client-side validation', () => {
  // The form has `<input required>` + `<input type="email">`, so the browser's
  // native HTML5 validation would normally short-circuit a click on submit
  // before our validateLoginForm gets a chance to run. We disable HTML5
  // validation per-test via `form.noValidate = true` so we can exercise the
  // app-level path. In production the two layers run in series; either one
  // alone would block a malformed submit.
  test('submitting empty fields surfaces our inline errors (HTML5 bypassed)', async ({ page }) => {
    await page.goto('/auth/login');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });
    await page.getByRole('button', { name: /entrar|login/i }).first().click();
    await expect(page.getByText(/informe seu e-mail/i)).toBeVisible();
    await expect(page.getByText(/informe sua senha/i)).toBeVisible();
  });

  test('a too-short password surfaces "A senha tem no mínimo 8 caracteres"', async ({ page }) => {
    // Valid email + 5-char password → passes HTML5 (both required fields are
    // non-empty, email type-checks), trips validateLoginForm's password rule.
    await page.goto('/auth/login');
    await page.locator('input[type="email"], input[name="email"]').first().fill('user@example.com');
    await page.locator('input[type="password"], input[name="password"]').first().fill('short');
    await page.getByRole('button', { name: /entrar|login/i }).first().click();
    await expect(page.getByText(/no mínimo 8 caracteres/i)).toBeVisible();
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

test.describe('public listing route', () => {
  test('/listings responds without auth and does not 5xx', async ({ page }) => {
    // The listings index is a public, server-rendered page. We can't assert
    // a specific h1/h2 because in a clean test env (no seeded fixtures) the
    // page may render an empty-state component instead of a heading. The
    // contract under test is the same as in middleware.ts: this path is in
    // the public allowlist and must NOT redirect to /auth/login.
    const response = await page.goto('/listings');
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
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
