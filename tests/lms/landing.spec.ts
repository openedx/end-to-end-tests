import { checkA11y } from '../../src/a11y';
import { test, expect } from '../../src/fixtures';
import { testId } from '../../src/reporting';
import { catalogSearchTermFor } from '../../src/steps';

/**
 * The public landing page. The LMS root lands a signed-out visitor on the
 * catalog MFE's home wherever that MFE is enabled, so the landing cases
 * (TC-00062, TC-00065) drive the catalog home and its header.
 */
test.describe('LMS landing page', () => {
  /**
   * Proof-of-life: the LMS landing page loads. This exercises the whole wiring
   * end to end — validated config, the composition fixture, the Playwright
   * project/tag setup — without depending on any authenticated state or seeded
   * data, so it is a safe first check against any installation.
   */
  test('loads over a healthy HTTP response', { tag: '@smoke' }, async ({ page, config }) => {
    const response = await page.goto(config.baseUrls.lms);

    expect(response, 'expected a navigation response from the LMS').not.toBeNull();
    expect(
      response?.status(),
      'the LMS landing page should return a non-error status',
    ).toBeLessThan(400);

    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/\S/);

    await checkA11y(page, { label: 'landing' });
  });

  test(
    'the catalog link leads to the course catalog',
    { tag: ['@regression', '@catalog-search', '@mfe-catalog'], annotation: testId('TC-00062') },
    async ({ siteHeader, publicChrome, catalogPage }) => {
      void publicChrome;
      await expect(siteHeader.mainLinks).toHaveCount(1);
      await siteHeader.follow(siteHeader.mainLinks.first());
      await expect(catalogPage.resultsStatusBar).toBeVisible();
    },
  );

  test(
    'the register and sign-in buttons lead to their forms',
    { tag: ['@regression', '@mfe-catalog', '@mfe-authn'], annotation: testId('TC-00062') },
    async ({ siteHeader, publicChrome, catalogHomePage, registrationPage, loginPage }) => {
      void publicChrome;
      await siteHeader.follow(siteHeader.registerLink);
      await expect(registrationPage.name).toBeVisible();

      await catalogHomePage.goto();
      await siteHeader.follow(siteHeader.signInLink);
      await expect(loginPage.emailOrUsername).toBeVisible();
    },
  );

  test(
    'searches the catalog from the home page',
    { tag: ['@regression', '@catalog-search', '@mfe-catalog'], annotation: testId('TC-00065') },
    async ({ page, catalogHomePage, catalogPage, courseKey, courseDetail }) => {
      await catalogHomePage.goto();
      // The field starts empty behind a placeholder; the placeholder's words are
      // localized, so only its presence is checked.
      await expect(catalogHomePage.searchInput).toHaveValue('');
      await expect(catalogHomePage.searchInput).toHaveAttribute('placeholder', /\S/);

      const term = catalogSearchTermFor(courseDetail);
      await catalogHomePage.search(term);
      await expect(catalogPage.courseCard(courseKey)).toBeVisible();

      // Clearing the term and searching again returns to the unfiltered catalog.
      await catalogPage.searchInput.fill('');
      await catalogPage.searchInput.press('Enter');
      await expect.poll(() => new URL(page.url()).searchParams.get('search_query') ?? '').toBe('');
      await expect(catalogPage.resultsStatusBar).toBeVisible();
    },
  );
});
