import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { anonymousHeaderExpectation } from '../../../src/steps';

/**
 * The page header (TC-00019, TC-00020, TC-00021, TC-00023).
 *
 * What a header offers is configuration — a Help link exists iff `SUPPORT_URL`
 * is set, the catalog link iff discovery is on — so every case compares the
 * rendered header with the target's own chrome configuration
 * (`readPageChrome`), never with the sheet's list of labels, which describes
 * one provider's setup. The same assertions hold whichever frontend rendered
 * the header: the page objects read all three generations.
 */
test.describe('Site header', () => {
  test(
    'offers a signed-out visitor the catalog, sign-in and registration',
    { tag: ['@smoke', '@mfe-catalog'], annotation: testId('TC-00019') },
    async ({ page, siteHeader, publicChrome, loginPage }) => {
      const expected = anonymousHeaderExpectation(publicChrome.chrome);

      await expect(siteHeader.logoLink).toBeVisible();
      await expect(siteHeader.logoImage).toBeVisible();
      await expect(siteHeader.mainLinks).toHaveCount(expected.mainLinks);
      await expect(siteHeader.anonymousLinks).toHaveCount(expected.callsToAction);

      // The brand link leads a signed-out visitor to sign in.
      await siteHeader.follow(siteHeader.logoLink);
      await expect(loginPage.emailOrUsername).toBeVisible();
      await expect(page).toHaveURL(/\/login\b/);
    },
  );
});
