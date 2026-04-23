import { test, expect } from '@playwright/test';

// Smoke tests — prove that the key public routes render without a crash.
// These do NOT exercise authenticated flows. Their purpose is to catch
// "page throws on mount" and "primary CTA doesn't exist" regressions —
// the class of bug that tsc + jest + eslint cannot see.

test.describe('public pages render', () => {
  test('homepage responds and renders a heading', async ({ page }) => {
    await page.goto('/');
    // Any visible heading / branding — we don't over-specify copy so the
    // marketing team can iterate without breaking the test.
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('login page shows email + password + submit', async ({ page }) => {
    await page.goto('/auth/login');
    // Loose selectors by role/type so we don't break on copy tweaks.
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
    await expect(page.getByRole('button').first()).toBeVisible();
  });

  test('register page shows an email field', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
  });
});

test.describe('auth gates', () => {
  // Hitting a promotion page unauthenticated should push the user back
  // to /auth/login. This is a regression test for the gating logic in
  // apps/web/src/app/promotions/*/page.tsx.
  for (const path of ['/promotions/boost', '/promotions/megaphone', '/promotions/highlight']) {
    test(`${path} redirects unauthenticated users to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});
