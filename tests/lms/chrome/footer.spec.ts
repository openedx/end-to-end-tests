import { expect, test } from '../../../src/fixtures';
import { testId } from '../../../src/reporting';
import { partitionSiteLinks } from '../../../src/steps';

/**
 * The public site's footer (TC-00063, TC-00064).
 *
 * Which links a footer carries is theme data: the sheet's seven links and
 * "Powered by Tutor" logo describe one provider's theme, while the default
 * Open edX footers carry none (the legacy footer) or four empty link columns
 * (the frontend-base shell). So TC-00063 asserts that every link the footer
 * renders works and that the "Powered by Open edX" logo is there, and never
 * the set of links.
 */
test.describe('Site footer', () => {
  test(
    'renders working links and the Powered by Open edX logo',
    { tag: ['@regression', '@mfe-catalog'], annotation: testId('TC-00063') },
    async ({ request, config, siteFooter, publicChrome }) => {
      void publicChrome;
      await expect(siteFooter.poweredByLink).toBeVisible();
      expect(await siteFooter.imageLoaded(siteFooter.poweredByLink)).toBe(true);

      // Links on the installation must resolve; off-site links (openedx.org, a
      // theme's social pages) are checked for a well-formed target only, so the
      // suite never depends on a third party being reachable.
      const urls = await siteFooter.linkUrls();
      expect(urls.length).toBeGreaterThan(0);
      const { onSite, offSite } = partitionSiteLinks(urls, config);
      for (const url of offSite) {
        expect(['http:', 'https:', 'mailto:'], `footer link ${url}`).toContain(
          new URL(url).protocol,
        );
      }
      for (const url of onSite) {
        expect((await request.get(url)).status(), `footer link ${url}`).toBeLessThan(400);
      }
    },
  );

  test(
    'carries the legal notice with the current year and the site name',
    { tag: ['@regression', '@frontend-base', '@mfe-catalog'], annotation: testId('TC-00064') },
    async ({ siteFooter, publicChrome }) => {
      // Only the frontend-base shell footer has a legal line (`FOOTER-001`).
      // The year and the site name are data; the wording around them is copy.
      const siteName = publicChrome.chrome.siteName;
      expect(siteName, 'the site config names the site').toBeDefined();
      await expect(siteFooter.legalNotice).toContainText(String(new Date().getUTCFullYear()));
      await expect(siteFooter.legalNotice).toContainText(siteName!);
    },
  );
});
