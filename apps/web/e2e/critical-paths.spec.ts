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
  // validation per-test via `form.noValidate = true` and call
  // `form.requestSubmit()` directly so the synthetic submit event reaches
  // React's onSubmit handler regardless of the click cascade. In production
  // both layers run in series; either alone blocks a malformed submit.
  test('submitting empty fields surfaces our inline errors (HTML5 bypassed)', async ({ page }) => {
    await page.goto('/auth/login');
    // Wait until React has actually mounted the form before we touch it.
    await page.waitForSelector('form');
    await page.getByLabel(/e-mail/i).waitFor();
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      if (!form) throw new Error('login form not found');
      form.noValidate = true;
      form.requestSubmit();
    });
    await expect(page.getByText(/informe seu e-mail/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/informe sua senha/i)).toBeVisible();
  });

  test('a too-short password surfaces "A senha tem no mínimo 8 caracteres"', async ({ page }) => {
    // Valid email + 5-char password → passes HTML5 (both required fields are
    // non-empty, email type-checks), trips validateLoginForm's password rule.
    await page.goto('/auth/login');
    await page.waitForSelector('form');
    await page.getByLabel('E-mail').fill('user@example.com');
    await page.getByLabel('Senha').fill('short');
    // requestSubmit() instead of clicking the button — sidesteps any timing
    // issue where the button's pointer events haven't bound yet on a slow
    // dev-mode compile.
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    });
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
