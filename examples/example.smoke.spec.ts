import { test, expect } from '../src/fixtures';

/**
 * Proof that an external provider **reuses the suite's own building blocks** —
 * here the extended `test`/fixtures imported straight from `src/` — so it adds
 * coverage without redoing any infrastructure. Runs in the mirrored
 * `smoke/examples` project (needs a reachable target).
 */
test('external smoke spec visits the LMS home page', { tag: '@smoke' }, async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
});
