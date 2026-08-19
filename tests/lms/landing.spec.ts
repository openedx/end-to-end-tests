import { test, expect } from '../../src/fixtures';

/**
 * Proof-of-life smoke test: the LMS landing page loads. This exercises the whole
 * wiring end to end — validated config, the composition fixture, the Playwright
 * project/tag setup — without depending on any authenticated state or seeded
 * data, so it is a safe first check against any installation.
 */
test.describe('LMS landing page', () => {
  test('loads over a healthy HTTP response', { tag: '@smoke' }, async ({ page, config }) => {
    const response = await page.goto(config.baseUrls.lms);

    expect(response, 'expected a navigation response from the LMS').not.toBeNull();
    expect(
      response?.status(),
      'the LMS landing page should return a non-error status',
    ).toBeLessThan(400);

    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/\S/);
  });
});
